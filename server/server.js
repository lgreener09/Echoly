require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");
const Stripe = require("stripe");
// firebase-admin v14 dropped the old namespaced API (admin.credential,
// admin.auth(), etc.) off the top-level import — these live under subpath
// imports now.
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

const app = express();

// Render (and most hosts) puts the app behind a reverse proxy, so every
// request technically arrives "from" that proxy's IP unless we trust its
// X-Forwarded-For header. Without this, the rate limiter below would see
// every visitor as the same IP and either block everyone together or (worse)
// fail open. "1" trusts exactly one hop, which matches Render's setup.
app.set("trust proxy", 1);

let client = null;
function getClient() {
    if (!client) {
        client = new OpenAI(); // reads OPENAI_API_KEY from your .env
    }
    return client;
}

// Same model tier FixAI's vision diagnosis used — cheap, fast, and this is a
// short back-and-forth chat turn (a paragraph or two of context in, a couple
// sentences out), not something that needs flagship-tier reasoning. Bump to
// terra or sol if replies start feeling flat or the coaching tips get
// unreliable in practice.
const MODEL = "gpt-5.6-luna";

app.use(cors());
app.use(express.json({
    limit: "1mb",
    // Stripe's webhook signature check (further down) needs the exact raw
    // request bytes, not the parsed object — capture them here once, for
    // every request, rather than special-casing route/middleware order just
    // for that one endpoint.
    verify: (req, res, buf) => { req.rawBody = buf; }
}));
// Express 5 leaves req.body undefined (not {}) when a request has no JSON
// body, so `const { ... } = req.body` in a route would throw and turn a
// simple bad request into a confusing 500. Default it to an empty object.
app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
});

// ==============================
// Firebase Admin — verifies the ID token a signed-in learner's browser sends,
// so the server knows *who* is calling (used for everything below), and also
// gives the server its own Firestore access via `db`, used only for billing
// state (see the "Billing state" section below) — everything else a learner
// sees (progress, streak, vocab) stays exactly as it was: written directly
// by the client, secured by Firestore rules, never touched here. Optional:
// if no service account is configured, signed-in-only features (premium,
// the free-tier daily cap) simply don't activate and every request is
// treated as a guest, same as before this feature existed.
// ==============================
let firebaseAdminReady = false;
let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        initializeApp({
            credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
        });
        firebaseAdminReady = true;
        db = getFirestore();
    }
} catch (error) {
    console.error("Firebase Admin failed to initialize — check FIREBASE_SERVICE_ACCOUNT_JSON:", error.message);
}

// Reads an "Authorization: Bearer <idToken>" header, if present, and
// verifies it against Firebase. Never blocks the request either way — a
// missing or invalid/expired token just means req.uid stays null and the
// caller is treated as a guest, same as every request was before this
// feature existed.
async function attachUserIfSignedIn(req, res, next) {
    req.uid = null;
    const authHeader = req.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (firebaseAdminReady && idToken) {
        try {
            const decoded = await getAuth().verifyIdToken(idToken);
            req.uid = decoded.uid;
        } catch (error) {
            // Stale/invalid token — fall through as a guest rather than erroring;
            // a leftover token in the browser shouldn't break the conversation.
        }
    }
    next();
}

// ==============================
// Stripe — subscriptions
// ==============================
let stripeClient = null;
function getStripe() {
    if (!stripeClient) {
        stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
}

// Billing state (premium status + Stripe customer id) is the one piece of
// per-user state that's genuinely expensive to lose: unlike the caches below,
// losing it doesn't just cost a cache miss or reset something free — it
// makes someone who is actively paying look like a free user, capped at
// FREE_DAILY_CONVERSATIONS, until their next Stripe webhook happens to fire
// (which, for a stable subscription with no changes, can be a month away at
// renewal). So this lives in Firestore — the `billing` collection, one doc
// per uid, written only by this server via the Admin SDK and never touched
// by the client — rather than a plain in-memory Map, and survives a Render
// free-tier sleep/restart intact. `db` is null when Firebase Admin isn't
// configured (see above); every helper below treats that the same as "no
// record yet" so billing simply stays inactive rather than erroring.
function billingCollection() {
    return db.collection("billing");
}

// Also carries the free-tier bookkeeping (today's conversation count and
// referral bonus) — see "Free-tier usage + referrals" below for why those
// moved here from in-memory Maps.
async function getBillingRecord(uid) {
    if (!db) return { premium: false, stripeCustomerId: null, ...memoryUsageFor(uid) };
    const snap = await billingCollection().doc(uid).get();
    const data = snap.exists ? snap.data() : {};
    return {
        premium: data.premium === true,
        stripeCustomerId: data.stripeCustomerId || null,
        referralBonus: typeof data.referralBonus === "number" ? data.referralBonus : 0,
        referredBy: data.referredBy || null,
        dailyConvos: data.dailyConvos && typeof data.dailyConvos === "object" ? data.dailyConvos : null
    };
}

async function setBillingRecord(uid, fields) {
    if (!db) return;
    await billingCollection().doc(uid).set(fields, { merge: true });
}

// Recovers the uid for a Stripe customer id from Firestore. Falls back to
// the metadata set when the customer was created (belt-and-suspenders for a
// customer whose billing doc write hasn't landed yet) — same fallback this
// had before Firestore backed it, just reached a different way.
async function uidForStripeCustomer(customerId) {
    if (!db) return null;
    const snap = await billingCollection().where("stripeCustomerId", "==", customerId).limit(1).get();
    if (!snap.empty) return snap.docs[0].id;
    try {
        const customer = await getStripe().customers.retrieve(customerId);
        return customer?.metadata?.firebaseUid || null;
    } catch (error) {
        return null;
    }
}

// ==============================
// Free-tier usage + referrals
// ==============================
// These used to live in in-memory Maps, which reset on every redeploy and
// every Render restart. That had two visible effects: a learner's "+3
// conversations/day" referral bonus silently vanished after the next
// deploy (and they could then claim another referral), and the 5/day cap
// reset mid-day whenever the server restarted. They now live on the same
// server-only billing/{uid} doc as premium status:
//   referralBonus  number — extra conversations/day from referrals
//   referredBy     uid of whoever referred this learner (set once)
//   dailyConvos    { date: "YYYY-MM-DD" (UTC), count }
// The Maps below are only a fallback for local development without
// FIREBASE_SERVICE_ACCOUNT_JSON (db === null).
const memDailyConvos = new Map();  // uid -> { date, count }
const memReferralBonus = new Map(); // uid -> number
const memReferredBy = new Map();    // uid -> referrer uid

const FREE_DAILY_CONVERSATIONS = 5;
const REFERRAL_BONUS_CONVERSATIONS = 3; // added to both sides' daily limit when a referral is claimed
// Cap on how much extra a REFERRER can earn (5 referrals' worth). Without
// it, someone could make throwaway accounts that each claim their code and
// end up with unlimited free conversations. The friend who signs up still
// always gets their own +3.
const MAX_REFERRER_BONUS = 15;
// Guests (not signed in) are capped per network address per day on the
// server too. The app's own "3 free guest conversations" count lives in the
// browser, so signing out or opening a private window used to reset it —
// and since guests had no server-side cap at all, that meant unlimited
// free conversations. A little above the app's 3 so people sharing a
// network (a household, an office) aren't cut off by each other right away.
const GUEST_DAILY_CONVERSATIONS_PER_IP = 5;

function todayUtc() {
    return new Date().toISOString().slice(0, 10);
}

function memoryUsageFor(uid) {
    return {
        referralBonus: memReferralBonus.get(uid) || 0,
        referredBy: memReferredBy.get(uid) || null,
        dailyConvos: memDailyConvos.get(uid) || null
    };
}

function dailyLimitFromRecord(record) {
    return FREE_DAILY_CONVERSATIONS + (record.referralBonus || 0);
}

function usedTodayFromRecord(record) {
    const d = record.dailyConvos;
    return d && d.date === todayUtc() && typeof d.count === "number" ? d.count : 0;
}

// Counts one started conversation against today's free allowance.
async function incrementDailyConvos(uid) {
    const today = todayUtc();
    if (!db) {
        const cur = memDailyConvos.get(uid);
        memDailyConvos.set(uid, { date: today, count: cur && cur.date === today ? cur.count + 1 : 1 });
        return;
    }
    const ref = billingCollection().doc(uid);
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const cur = snap.exists ? snap.data().dailyConvos : null;
        const count = cur && cur.date === today && typeof cur.count === "number" ? cur.count + 1 : 1;
        tx.set(ref, { dailyConvos: { date: today, count } }, { merge: true });
    });
}

// Guest usage, keyed by a hash of the visitor's IP address plus the date —
// the raw IP is never stored. Kept in Firestore (guestUsage collection,
// server-only) so it survives restarts; old docs are harmless and tiny.
function guestUsageId(ip) {
    return crypto.createHash("sha256").update(`${ip || "unknown"}::${todayUtc()}`).digest("hex").slice(0, 40);
}
const memGuestUsage = new Map(); // guestUsageId -> count (fallback without Firestore)

async function guestUsedToday(ip) {
    const id = guestUsageId(ip);
    if (!db) return memGuestUsage.get(id) || 0;
    const snap = await db.collection("guestUsage").doc(id).get();
    return snap.exists && typeof snap.data().count === "number" ? snap.data().count : 0;
}

async function incrementGuestUsage(ip) {
    const id = guestUsageId(ip);
    if (!db) {
        memGuestUsage.set(id, (memGuestUsage.get(id) || 0) + 1);
        return;
    }
    await db.collection("guestUsage").doc(id).set(
        { count: FieldValue.increment(1), date: todayUtc() },
        { merge: true }
    );
}

// Returns "claimed", "already-claimed".
async function claimReferral(uid, code) {
    if (!db) {
        if (memReferredBy.has(uid)) return "already-claimed";
        memReferredBy.set(uid, code);
        memReferralBonus.set(uid, (memReferralBonus.get(uid) || 0) + REFERRAL_BONUS_CONVERSATIONS);
        memReferralBonus.set(code, Math.min(MAX_REFERRER_BONUS, (memReferralBonus.get(code) || 0) + REFERRAL_BONUS_CONVERSATIONS));
        return "claimed";
    }
    const mine = billingCollection().doc(uid);
    const theirs = billingCollection().doc(code);
    return db.runTransaction(async tx => {
        const mySnap = await tx.get(mine);
        const myData = mySnap.exists ? mySnap.data() : {};
        if (myData.referredBy) return "already-claimed";
        const theirSnap = await tx.get(theirs);
        const theirBonus = theirSnap.exists && typeof theirSnap.data().referralBonus === "number" ? theirSnap.data().referralBonus : 0;
        const myBonus = typeof myData.referralBonus === "number" ? myData.referralBonus : 0;
        tx.set(mine, { referredBy: code, referralBonus: myBonus + REFERRAL_BONUS_CONVERSATIONS }, { merge: true });
        if (theirBonus < MAX_REFERRER_BONUS) {
            tx.set(theirs, { referralBonus: Math.min(MAX_REFERRER_BONUS, theirBonus + REFERRAL_BONUS_CONVERSATIONS) }, { merge: true });
        }
        return "claimed";
    });
}

// ==============================
// Caching — lesson-intro / lesson-practice / lookup
// ==============================
// These three endpoints generate the same content for anyone hitting the
// same (scenario, language) pair (or the same phrase, for lookups) — the
// AI call doesn't need to happen more than once per combination, only once
// ever, then reused for every learner after that. This is an in-memory
// cache (a plain Map living in this process), which is the right tradeoff
// for where the app is right now: free to add, no new service to run, and
// it still catches the case that matters most for cost — a burst of
// traffic hitting the same handful of lessons — since the server stays
// warm through a burst. The tradeoff: Render's free tier spins the server
// down after inactivity, and a restart wipes this cache, so it rebuilds
// from scratch after every sleep/wake cycle rather than staying warm
// forever. If usage grows enough that this gap starts showing up in real
// OpenAI cost (or the server moves to an always-on paid plan, or ever runs
// as more than one instance), that's the point to move this to Firestore
// instead of a Map.
const lessonIntroCache = new Map();
const lessonPracticeCache = new Map();
const lookupCache = new Map();

function scenarioCacheKey(scenarioId, language, nativeLanguage) {
    return `${scenarioId}::${language}::${nativeLanguage}`;
}
function lookupCacheKey(phrase, language, nativeLanguage) {
    return `${language}::${nativeLanguage}::${phrase.trim().toLowerCase()}`;
}

// Simple manual override so a bad cached entry (an off generation that
// happened to be the first one cached for a combo) can be cleared without
// redeploying. Protected by a shared secret rather than left open, since
// it's a public server. Set ADMIN_SECRET in the environment to use this;
// without it set, the endpoint refuses every request.
app.post("/admin/cache/clear", (req, res) => {
    const providedSecret = req.get("X-Admin-Secret");
    if (!process.env.ADMIN_SECRET || providedSecret !== process.env.ADMIN_SECRET) {
        return res.status(404).json({ error: "Not found." }); // 404, not 401 — don't confirm this endpoint exists
    }
    const { scenarioId, language, phrase } = req.body || {};
    // Cache keys include the learner's native language (see
    // scenarioCacheKey/lookupCacheKey). Clearing used to leave that part
    // out, so the key never matched and nothing was actually cleared. Now a
    // specific nativeLanguage can be passed; without one, every native-
    // language variant of the entry is cleared.
    const nativeLanguages = req.body && req.body.nativeLanguage
        ? [normalizeNativeLanguage(req.body.nativeLanguage)]
        : NATIVE_LANGUAGES;
    if (phrase && language) {
        nativeLanguages.forEach(n => lookupCache.delete(lookupCacheKey(phrase, language, n)));
        return res.json({ success: true, cleared: "lookup", phrase, language });
    }
    if (scenarioId && language) {
        nativeLanguages.forEach(n => {
            const key = scenarioCacheKey(scenarioId, language, n);
            lessonIntroCache.delete(key);
            lessonPracticeCache.delete(key);
        });
        return res.json({ success: true, cleared: "lesson", scenarioId, language });
    }
    if (req.body && req.body.clearAll === true) {
        lessonIntroCache.clear();
        lessonPracticeCache.clear();
        lookupCache.clear();
        return res.json({ success: true, cleared: "all" });
    }
    return res.status(400).json({ error: "Provide scenarioId+language, phrase+language, or clearAll: true." });
});

// ==============================
// Rate limiting
// ==============================
// Every /converse call hits OpenAI's API and costs real money, so it gets a
// per-IP cap. This is the core loop of the whole app (unlike FixAI's one-off
// diagnosis), so the limit is more generous than a diagnosis endpoint would
// be — generous enough for a real practice session, tight enough to stop a
// script from running up an unbounded OpenAI bill. The OpenAI billing
// dashboard's spending cap is the backup in case this gets bypassed somehow
// (a shared IP, etc).
const conversationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many messages from this device recently. Please wait a few minutes and try again." }
});

// /lookup also calls OpenAI, but each call is a single one-shot lookup (no
// growing conversation history to pay for), so it gets its own, separate cap
// rather than sharing the conversation budget.
const lookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many lookups recently. Please wait a few minutes and try again." }
});

// /lesson-intro is called once per lesson entry (same frequency as starting
// a conversation), so it shares conversationLimiter's cap rather than
// getting a tighter one.
const introLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many lessons opened recently. Please wait a few minutes and try again." }
});

// /lesson-practice is also called once per lesson entry (right alongside
// /lesson-intro), so it gets the same cap.
const practiceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many practice rounds started recently. Please wait a few minutes and try again." }
});

// Serves the frontend (index.html = landing page, app.html = the app; one level up from this server/ folder)
// from this same Express app — one service, one URL, no CORS setup needed
// between two different domains. Locally, open http://localhost:3000 during
// development (not index.html directly).
// The static root is the whole project folder, which includes this
// server/ folder — don't serve the server's own source files to the web.
// One address for everyone: once CANONICAL_HOST is set on Render (e.g.
// "getecholy.com"), page visits to the old echoly-enjr.onrender.com address
// or to www. are permanently redirected there, so links, bookmarks and
// Google all end up on the real domain. Only GET/HEAD page loads are
// redirected — POSTs from Stripe webhooks, the GitHub reminder job and the
// app's own API calls keep working on whichever address they use. Leave
// CANONICAL_HOST unset until the domain is connected and working.
app.use((req, res, next) => {
    const canonical = (process.env.CANONICAL_HOST || "").trim().toLowerCase();
    if (!canonical || (req.method !== "GET" && req.method !== "HEAD")) return next();
    const host = (req.get("host") || "").toLowerCase().split(":")[0];
    if (host === canonical) return next();
    if (host.endsWith(".onrender.com") || host === `www.${canonical}`) {
        return res.redirect(301, `https://${canonical}${req.originalUrl}`);
    }
    next();
});

app.use("/server", (req, res) => res.status(404).end());
app.use(express.static(path.join(__dirname, "..")));

// ==============================
// Scenarios
// ==============================
// Each scenario just needs a short human-facing description plus a "who am
// I talking to" character brief for the system prompt — the AI generates
// the actual dialogue dynamically, so there's no per-language content to
// maintain. Adding a new scenario later is a matter of adding one entry
// here, not building out new screens or content.
// Ordered as a single progression path — index order matters here (it's
// mirrored in index.html's PATH array) since lessons unlock sequentially,
// one at a time, grouped visually into four tiers: Intro, Beginner,
// Intermediate, Advanced.
//
// The "Intro" tier exists for learners who don't know any of the language
// yet — a roleplay scenario (order coffee, book a hotel room) doesn't work
// if you have zero vocabulary to start from. These aren't roleplay so much
// as short, guided vocabulary primers: the "character" is a patient tutor
// rather than a barista/clerk/etc, and buildSystemPrompt below gives Intro
// lessons extra instructions to always hand the learner the exact phrase to
// try next (see isIntro below) rather than expecting them to produce
// language from nothing. They come first in the path, so a brand new
// learner works through these before unlocking the roleplay scenarios.
const SCENARIOS = {
    greetings_farewells: {
        tier: "Intro",
        title: "Greetings & Farewells",
        blurb: "Learn how to say hello and goodbye.",
        icon: "👋",
        character: "a warm, patient language tutor giving the learner their very first words",
        opening: "warmly welcome the learner, teach them a simple way to say hello, and invite them to try it back"
    },
    yes_no_please_thanks: {
        tier: "Intro",
        title: "Yes, No, Please, Thank You",
        blurb: "The small words you'll use constantly in almost every conversation.",
        icon: "🙏",
        character: "a warm, patient language tutor teaching the most essential everyday words",
        opening: "greet the learner briefly, then teach them how to say \"yes\" and invite them to try it"
    },
    introduce_yourself_basics: {
        tier: "Intro",
        title: "Introduce Yourself",
        blurb: "Say your name and where you're from.",
        icon: "🙋",
        character: "a warm, patient language tutor helping the learner introduce themselves for the first time",
        opening: "greet the learner and teach them a simple phrase for saying their own name"
    },
    numbers_basics: {
        tier: "Intro",
        title: "Numbers 1–20",
        blurb: "Count and use numbers in everyday situations.",
        icon: "🔢",
        character: "a warm, patient language tutor teaching numbers one at a time",
        opening: "greet the learner and teach them how to count to three, then invite them to try"
    },
    how_are_you_basics: {
        tier: "Intro",
        title: "Asking How Someone Is",
        blurb: "Ask how someone's doing, and answer when they ask you.",
        icon: "😊",
        character: "a warm, patient language tutor teaching a common everyday exchange",
        opening: "greet the learner and teach them how to ask someone how they're doing"
    },
    question_words_basics: {
        tier: "Intro",
        title: "Common Question Words",
        blurb: "Who, what, where, when, why, how — the words that unlock almost any conversation.",
        icon: "❓",
        character: "a warm, patient language tutor teaching the core question words one at a time",
        opening: "greet the learner and teach them the word for \"what\", then invite them to try it"
    },
    days_of_week_basics: {
        tier: "Intro",
        title: "Days of the Week",
        blurb: "Talk about today, tomorrow, and the days of the week.",
        icon: "📅",
        character: "a warm, patient language tutor teaching the days of the week",
        opening: "greet the learner and teach them the word for \"today\""
    },
    basic_adjectives: {
        tier: "Intro",
        title: "Describing Things",
        blurb: "Common describing words like good, bad, big, and small.",
        icon: "🎨",
        character: "a warm, patient language tutor teaching simple describing words",
        opening: "greet the learner and teach them the word for \"good\", then invite them to try it"
    },
    family_members_basics: {
        tier: "Intro",
        title: "Family Members",
        blurb: "Talk about your family — mother, father, sibling, and more.",
        icon: "👪",
        character: "a warm, patient language tutor teaching family vocabulary",
        opening: "greet the learner and teach them the word for \"mother\", then invite them to try it"
    },
    asking_for_help_basics: {
        tier: "Intro",
        title: "Asking for Help",
        blurb: "Say you don't understand and ask someone to slow down or repeat themselves.",
        icon: "🆘",
        character: "a warm, patient language tutor teaching phrases every beginner needs early on",
        opening: "greet the learner and teach them how to say \"I don't understand\""
    },
    // Added after launch, at the END of the Intro tier so nobody's place in
    // the path moved. cafe_order's `unlockAfter` keeps the first Beginner
    // lesson open for anyone who'd already finished the original Intro
    // tier (it used to follow asking_for_help_basics directly).
    how_do_you_say_basics: {
        tier: "Intro",
        title: "How Do You Say…?",
        blurb: "Ask what words mean and how to say things, so you can keep going when you're stuck.",
        icon: "💬",
        character: "a warm, patient language tutor teaching the phrases that rescue any conversation",
        opening: "greet the learner and teach them how to ask \"How do you say…?\", then invite them to try it"
    },
    ordering_basics: {
        tier: "Intro",
        title: "Ordering Food & Drinks",
        blurb: "Say \"I'd like…\" and ask for water, coffee, the menu and the bill.",
        icon: "🥤",
        character: "a warm, patient language tutor teaching the first words you need to order at a café or restaurant",
        opening: "greet the learner and teach them how to say \"I'd like…\", then invite them to try it"
    },
    where_is_basics: {
        tier: "Intro",
        title: "Where Is…?",
        blurb: "Ask where things are, and understand left, right and straight ahead.",
        icon: "📍",
        character: "a warm, patient language tutor teaching how to ask for and understand simple directions",
        opening: "greet the learner and teach them how to ask \"Where is the bathroom?\", then invite them to try it"
    },
    prices_basics: {
        tier: "Intro",
        title: "Prices & Paying",
        blurb: "Ask how much something costs and say how you'd like to pay.",
        icon: "💳",
        character: "a warm, patient language tutor teaching the words for prices, money and paying",
        opening: "greet the learner and teach them how to ask \"How much is it?\", then invite them to try it"
    },
    likes_basics: {
        tier: "Intro",
        title: "Likes & Dislikes",
        blurb: "Say what you like, love and don't like, the heart of every bit of small talk.",
        icon: "❤️",
        character: "a warm, patient language tutor teaching how to talk about what you like and don't like",
        opening: "greet the learner and teach them how to say \"I like…\", then invite them to try it"
    },
    first_conversation: {
        tier: "Intro",
        title: "Your First Real Conversation",
        blurb: "Put it all together in a relaxed chat with a friendly local, using what you've learned.",
        icon: "🏆",
        milestone: true,
        character: "a friendly local the learner has just met at a café, who chats slowly and kindly, reacting naturally to what the learner says and asking simple follow-up questions",
        opening: "greet the learner warmly, as a friendly stranger at the next table would, and ask how they are"
    },
    cafe_order: {
        tier: "Beginner",
        unlockAfter: "asking_for_help_basics",
        title: "Order a coffee",
        blurb: "Practice ordering at a café counter.",
        icon: "☕",
        character: "a friendly barista working the counter at a busy café",
        opening: "greet the customer and ask what they'd like"
    },
    directions: {
        tier: "Beginner",
        title: "Ask for directions",
        blurb: "Stop a stranger and find your way somewhere.",
        icon: "🧭",
        character: "a friendly local stranger stopped on a city street",
        opening: "notice the person seems to be looking for something and ask if they need help"
    },
    ticket_purchase: {
        tier: "Beginner",
        title: "Buy a bus or train ticket",
        blurb: "Get a ticket at the station counter.",
        icon: "🎫",
        character: "a ticket agent at a train or bus station counter",
        opening: "greet the traveler and ask where they're headed"
    },
    grocery_checkout: {
        tier: "Beginner",
        title: "Check out at a grocery store",
        blurb: "Pay for your groceries and make small talk.",
        icon: "🛒",
        character: "a cashier at a grocery store checkout",
        opening: "greet the customer and ask if they found everything okay"
    },
    fast_food_order: {
        tier: "Beginner",
        title: "Order at a fast food counter",
        blurb: "Order a quick meal at the counter.",
        icon: "🍔",
        character: "a cashier at a fast food counter",
        opening: "greet the customer and ask what they'd like to order"
    },
    ice_cream_order: {
        tier: "Beginner",
        title: "Order an ice cream",
        blurb: "Pick a flavor at an ice cream shop.",
        icon: "🍦",
        character: "an ice cream shop employee behind the counter",
        opening: "greet the customer and ask what flavor they'd like"
    },
    ask_time: {
        tier: "Beginner",
        title: "Ask someone for the time",
        blurb: "Stop someone on the street to ask what time it is.",
        icon: "🕐",
        character: "a passerby on the street",
        opening: "respond naturally after being asked the time, and add a brief friendly remark"
    },
    buy_snack: {
        tier: "Beginner",
        title: "Buy a snack from a street vendor",
        blurb: "Buy something from a street food cart.",
        icon: "🥨",
        character: "a street food vendor at a cart",
        opening: "greet the customer and ask what they'd like"
    },
    greet_neighbor: {
        tier: "Beginner",
        title: "Greet a new neighbor",
        blurb: "Introduce yourself to someone who just moved in nearby.",
        icon: "👋",
        character: "a neighbor who just moved in nearby",
        opening: "greet the person warmly, since you just moved in and are meeting them for the first time"
    },
    ask_price: {
        tier: "Beginner",
        title: "Ask the price of an item",
        blurb: "Ask a shop clerk how much something costs.",
        icon: "🏷️",
        character: "a shop clerk in a small store",
        opening: "greet the customer and ask if they need help finding anything"
    },
    return_library_book: {
        tier: "Beginner",
        title: "Return a library book",
        blurb: "Return a book and maybe check out a new one.",
        icon: "📚",
        character: "a librarian at the front desk",
        opening: "greet the visitor and ask how you can help"
    },
    ask_clothing_size: {
        tier: "Beginner",
        title: "Ask for a different size",
        blurb: "Ask a clothing store employee for another size.",
        icon: "👕",
        character: "a clothing store employee",
        opening: "greet the customer and ask if they're finding everything okay"
    },
    buy_flowers: {
        tier: "Beginner",
        title: "Buy flowers for someone",
        blurb: "Pick out flowers at a flower shop.",
        icon: "💐",
        character: "a florist at a flower shop",
        opening: "greet the customer and ask what the flowers are for or who they're for"
    },
    ask_wifi_password: {
        tier: "Beginner",
        title: "Ask for the wifi password",
        blurb: "Ask a café for their wifi password.",
        icon: "📶",
        character: "a barista at a café",
        opening: "greet the customer and ask what they'd like, or respond naturally if just asked a question"
    },
    buy_phone_charger: {
        tier: "Beginner",
        title: "Buy a phone charger",
        blurb: "Find and buy a charger at an electronics shop.",
        icon: "🔌",
        character: "an employee at an electronics shop",
        opening: "greet the customer and ask what they're looking for"
    },
    ask_store_hours: {
        tier: "Beginner",
        title: "Ask when a store closes",
        blurb: "Call or ask in person about store hours.",
        icon: "🕒",
        character: "an employee answering a question about store hours",
        opening: "respond naturally and helpfully when asked about the store's hours"
    },
    order_water: {
        tier: "Beginner",
        title: "Order water at a restaurant",
        blurb: "Order a drink and get seated at a restaurant.",
        icon: "💧",
        character: "a server at a restaurant",
        opening: "greet the guest, seat them, and ask what they'd like to drink"
    },
    exchange_currency: {
        tier: "Beginner",
        title: "Exchange currency at a bank",
        blurb: "Exchange money at a bank counter.",
        icon: "💱",
        character: "a bank teller at the currency exchange counter",
        opening: "greet the customer and ask what currency they'd like to exchange"
    },
    ask_bathroom: {
        tier: "Beginner",
        title: "Ask where the bathroom is",
        blurb: "Politely ask a shop or café where the restroom is.",
        icon: "🚻",
        character: "an employee at a shop or café",
        opening: "respond politely and helpfully when asked where the restroom is"
    },
    buy_stamps: {
        tier: "Beginner",
        title: "Buy stamps at the post office",
        blurb: "Mail a letter and buy stamps.",
        icon: "✉️",
        character: "a postal worker at the counter",
        opening: "greet the customer and ask how you can help them today"
    },
    ask_photo: {
        tier: "Beginner",
        title: "Ask a stranger to take your photo",
        blurb: "Ask someone nearby to take a picture of you.",
        icon: "📷",
        character: "a friendly stranger nearby",
        opening: "respond kindly when asked to take a photo, and offer to help"
    },
    borrow_pen: {
        tier: "Beginner",
        title: "Ask to borrow a pen",
        blurb: "Ask someone nearby if you can borrow a pen.",
        icon: "🖊️",
        character: "a stranger sitting nearby, like at a café or waiting room",
        opening: "respond naturally when asked if you have a pen to lend"
    },
    introduce_self: {
        tier: "Beginner",
        title: "Introduce yourself to someone new",
        blurb: "Meet someone for the first time at a casual event.",
        icon: "🙋",
        character: "someone you're meeting for the first time at a casual gathering",
        opening: "greet the person warmly since you're meeting for the first time"
    },
    buy_umbrella: {
        tier: "Beginner",
        title: "Buy an umbrella in the rain",
        blurb: "Duck into a shop to buy an umbrella.",
        icon: "☂️",
        character: "a shopkeeper at a small convenience store",
        opening: "greet the customer, who just came in out of the rain, and ask what they need"
    },
    order_pizza: {
        tier: "Beginner",
        title: "Order a pizza by phone",
        blurb: "Call a pizzeria to order delivery.",
        icon: "🍕",
        character: "a pizzeria employee taking phone orders",
        opening: "answer the phone as the pizzeria and ask what they'd like to order"
    },
    ask_parking: {
        tier: "Beginner",
        title: "Ask about parking at a garage",
        blurb: "Ask an attendant about parking rates.",
        icon: "🅿️",
        character: "a parking garage attendant",
        opening: "greet the driver and ask how you can help"
    },
    buy_movie_ticket: {
        tier: "Beginner",
        title: "Buy a movie ticket",
        blurb: "Buy a ticket at the box office.",
        icon: "🎬",
        character: "a movie theater box office clerk",
        opening: "greet the customer and ask which movie and showtime they'd like"
    },
    ask_recommendation: {
        tier: "Beginner",
        title: "Ask a clerk for a recommendation",
        blurb: "Ask a shop employee to recommend something.",
        icon: "💡",
        character: "a knowledgeable shop clerk",
        opening: "greet the customer and ask what they're looking for"
    },
    thank_host: {
        tier: "Beginner",
        title: "Thank a host and say goodbye",
        blurb: "Wrap up a visit and thank your host.",
        icon: "🙏",
        character: "a host whose home you're visiting, at the end of the visit",
        opening: "respond warmly as the guest says goodbye and thanks you"
    },
    order_taxi: {
        tier: "Beginner",
        title: "Order a taxi by phone",
        blurb: "Call to book a taxi or rideshare pickup.",
        icon: "🚕",
        character: "a taxi dispatcher taking phone bookings",
        opening: "answer the phone and ask where the customer needs to be picked up"
    },
    hotel_checkin: {
        tier: "Intermediate",
        title: "Check into a hotel",
        blurb: "Arrive at the front desk and check into your room.",
        icon: "🏨",
        character: "a hotel front-desk clerk",
        opening: "greet the guest and ask if they have a reservation"
    },
    coworker_smalltalk: {
        tier: "Intermediate",
        title: "Meet a new coworker",
        blurb: "Introduce yourself and make small talk on your first day.",
        icon: "🤝",
        character: "a friendly coworker meeting this person for the first time on their first day",
        opening: "introduce yourself and welcome them"
    },
    restaurant_reservation: {
        tier: "Intermediate",
        title: "Book a dinner reservation",
        blurb: "Call a restaurant and reserve a table.",
        icon: "🍽️",
        character: "a restaurant host answering the phone to take reservations",
        opening: "answer the phone as the restaurant and ask how you can help"
    },
    hairdresser_chat: {
        tier: "Intermediate",
        title: "Small talk at the hairdresser",
        blurb: "Chat with your hairdresser during a haircut.",
        icon: "💇",
        character: "a chatty hairdresser mid-haircut",
        opening: "greet the client, ask what they'd like done, and make easy conversation"
    },
    apartment_viewing: {
        tier: "Intermediate",
        title: "Ask about renting an apartment",
        blurb: "Ask a landlord questions about an apartment.",
        icon: "🏠",
        character: "a landlord showing an apartment for rent",
        opening: "greet the prospective tenant and start showing them around"
    },
    weekend_plans: {
        tier: "Intermediate",
        title: "Discuss weekend plans",
        blurb: "Chat with a friend about what to do this weekend.",
        icon: "📅",
        character: "a friend making weekend plans with you",
        opening: "ask casually what the other person is up to this weekend"
    },
    market_haggle: {
        tier: "Intermediate",
        title: "Negotiate at a street market",
        blurb: "Haggle over the price of an item at a market stall.",
        icon: "🛍️",
        character: "a market vendor at a stall, open to some negotiation",
        opening: "greet the customer and ask if they see something they like"
    },
    lost_and_found: {
        tier: "Intermediate",
        title: "Describe a lost item",
        blurb: "Report a lost item to a lost-and-found desk.",
        icon: "🔍",
        character: "an attendant at a lost-and-found desk",
        opening: "greet the visitor and ask what they lost"
    },
    mechanic_noise: {
        tier: "Intermediate",
        title: "Describe a car noise to a mechanic",
        blurb: "Explain a strange noise your car is making.",
        icon: "🚗",
        character: "a mechanic at an auto shop",
        opening: "greet the customer and ask what's going on with their car"
    },
    recipe_chat: {
        tier: "Intermediate",
        title: "Discuss a recipe with a friend",
        blurb: "Talk through how to make a dish with a friend.",
        icon: "🍳",
        character: "a friend who loves to cook, discussing a recipe",
        opening: "ask what the other person wants to cook and offer initial thoughts"
    },
    travel_agent: {
        tier: "Intermediate",
        title: "Plan a trip with a travel agent",
        blurb: "Work out details of a trip with a travel agent.",
        icon: "✈️",
        character: "a travel agent helping plan a trip",
        opening: "greet the client and ask where they're thinking of traveling"
    },
    teacher_conference: {
        tier: "Intermediate",
        title: "Talk to a teacher",
        blurb: "Discuss a child's progress with their teacher.",
        icon: "🏫",
        character: "a teacher meeting with a parent",
        opening: "greet the parent and start discussing how the student is doing"
    },
    librarian_help: {
        tier: "Intermediate",
        title: "Ask a librarian for help",
        blurb: "Get help finding a specific book.",
        icon: "📖",
        character: "a librarian at the reference desk",
        opening: "greet the visitor and ask what they're looking for"
    },
    book_doctor_appt: {
        tier: "Intermediate",
        title: "Book a doctor's appointment",
        blurb: "Call a clinic to schedule an appointment.",
        icon: "📞",
        character: "a receptionist at a doctor's office answering the phone",
        opening: "answer the phone as the clinic and ask how you can help"
    },
    return_defective_item: {
        tier: "Intermediate",
        title: "Return a broken product",
        blurb: "Explain the problem and return an item to customer service.",
        icon: "📦",
        character: "a customer service representative at a store's returns counter",
        opening: "greet the customer and ask what's going on with their item"
    },
    new_acquaintance_hobbies: {
        tier: "Intermediate",
        title: "Talk about hobbies",
        blurb: "Get to know someone new by talking about hobbies.",
        icon: "🎨",
        character: "someone you just met at a social event",
        opening: "ask the other person what they like to do in their free time"
    },
    open_bank_account: {
        tier: "Intermediate",
        title: "Open a bank account",
        blurb: "Set up a new account with a bank representative.",
        icon: "🏦",
        character: "a bank representative helping open a new account",
        opening: "greet the customer and ask what kind of account they're interested in"
    },
    movie_discussion: {
        tier: "Intermediate",
        title: "Discuss a movie",
        blurb: "Talk with a friend about a movie you both saw.",
        icon: "🎥",
        character: "a friend who just watched the same movie as you",
        opening: "ask what the other person thought of the movie"
    },
    negotiate_rent: {
        tier: "Intermediate",
        title: "Negotiate rent with a landlord",
        blurb: "Discuss the rent price for an apartment.",
        icon: "💵",
        character: "a landlord discussing rent for a unit",
        opening: "greet the prospective tenant and state the asking rent, open to discussion"
    },
    tailor_alterations: {
        tier: "Intermediate",
        title: "Get clothes altered",
        blurb: "Ask a tailor to alter a piece of clothing.",
        icon: "🧵",
        character: "a tailor at a alterations shop",
        opening: "greet the customer and ask what they need altered"
    },
    plan_birthday_party: {
        tier: "Intermediate",
        title: "Plan a birthday party",
        blurb: "Plan the details of a friend's birthday party.",
        icon: "🎂",
        character: "a friend helping plan a birthday party",
        opening: "start brainstorming ideas for the party with the other person"
    },
    describe_commute: {
        tier: "Intermediate",
        title: "Describe your commute",
        blurb: "Chat with a coworker about how you get to work.",
        icon: "🚌",
        character: "a coworker making conversation about commuting",
        opening: "ask the other person how their commute to work usually is"
    },
    vet_checkup: {
        tier: "Intermediate",
        title: "Talk to a vet about a pet",
        blurb: "Discuss your pet's checkup with a veterinarian.",
        icon: "🐾",
        character: "a veterinarian doing a routine pet checkup",
        opening: "greet the pet owner and ask how their pet has been doing"
    },
    real_estate_viewing: {
        tier: "Intermediate",
        title: "View an apartment with an agent",
        blurb: "Ask a real estate agent about a listing.",
        icon: "🔑",
        character: "a real estate agent showing a property",
        opening: "greet the client and start showing them the property"
    },
    work_deadline_chat: {
        tier: "Intermediate",
        title: "Discuss a work deadline",
        blurb: "Talk with a colleague about an upcoming deadline.",
        icon: "⏰",
        character: "a colleague checking in about a shared work deadline",
        opening: "ask how the other person's progress is going on the project"
    },
    barber_haircut: {
        tier: "Intermediate",
        title: "Ask for a specific haircut",
        blurb: "Describe the haircut you want to a barber.",
        icon: "💈",
        character: "a barber at a barbershop",
        opening: "greet the customer and ask what kind of cut they're looking for"
    },
    give_directions_home: {
        tier: "Intermediate",
        title: "Give directions to your home",
        blurb: "Explain to a visitor how to get to your place.",
        icon: "🗺️",
        character: "a friend calling to ask for directions to your home",
        opening: "ask for directions since you're trying to find the other person's place"
    },
    gym_smalltalk: {
        tier: "Intermediate",
        title: "Small talk at the gym",
        blurb: "Chat with someone between sets at the gym.",
        icon: "🏋️",
        character: "a fellow gym-goer making friendly conversation",
        opening: "strike up casual conversation between exercises"
    },
    plan_road_trip: {
        tier: "Intermediate",
        title: "Plan a road trip",
        blurb: "Plan a road trip itinerary with friends.",
        icon: "🚙",
        character: "a friend planning a road trip with you",
        opening: "suggest starting to plan out the road trip together"
    },
    discuss_weather_travel: {
        tier: "Intermediate",
        title: "Discuss weather and travel plans",
        blurb: "Talk about how weather might affect upcoming travel.",
        icon: "⛅",
        character: "a friend discussing upcoming travel plans",
        opening: "bring up the weather forecast and how it might affect the trip"
    },
    doctor_visit: {
        tier: "Advanced",
        title: "Describe symptoms to a doctor",
        blurb: "Explain how you're feeling at a doctor's appointment.",
        icon: "🩺",
        character: "a calm, attentive doctor at a routine appointment",
        opening: "greet the patient and ask what brings them in today"
    },
    job_interview: {
        tier: "Advanced",
        title: "Interview for a job",
        blurb: "Answer questions in a first-round job interview.",
        icon: "💼",
        character: "a hiring manager conducting a friendly first-round job interview",
        opening: "greet the candidate and open with a simple question like asking them to tell you about themselves"
    },
    customer_service: {
        tier: "Advanced",
        title: "Resolve a customer service issue",
        blurb: "Call about a problem with an order or a bill.",
        icon: "📞",
        character: "a customer service representative taking a call about a problem with an order or a bill",
        opening: "greet the caller and ask how you can help"
    },
    negotiate_salary: {
        tier: "Advanced",
        title: "Negotiate a salary offer",
        blurb: "Discuss salary expectations for a job offer.",
        icon: "💰",
        character: "a hiring manager discussing a job offer",
        opening: "present the offer and open the floor for questions or discussion"
    },
    roommate_conflict: {
        tier: "Advanced",
        title: "Discuss a conflict with a roommate",
        blurb: "Work through a disagreement with a roommate calmly.",
        icon: "🏘️",
        character: "a roommate you're having a minor disagreement with",
        opening: "bring up the issue calmly and openly, ready to talk it through"
    },
    work_presentation_qa: {
        tier: "Advanced",
        title: "Answer questions after a presentation",
        blurb: "Field audience questions after presenting at work.",
        icon: "📊",
        character: "an audience member asking follow-up questions after a work presentation",
        opening: "ask a thoughtful follow-up question about the presentation"
    },
    friendly_debate: {
        tier: "Advanced",
        title: "Debate a topic with a friend",
        blurb: "Discuss differing opinions on a topic respectfully.",
        icon: "🗣️",
        character: "a friend who has a different opinion on a lighthearted topic",
        opening: "share your opinion on the topic and invite the other person's view"
    },
    explain_legal_doc: {
        tier: "Advanced",
        title: "Ask about a legal document",
        blurb: "Get a document's terms explained by a clerk.",
        icon: "📄",
        character: "a clerk helping explain the terms of a document",
        opening: "greet the visitor and ask what they need help understanding"
    },
    negotiate_contract: {
        tier: "Advanced",
        title: "Negotiate a business contract",
        blurb: "Discuss terms of a contract with a business partner.",
        icon: "🤝",
        character: "a business partner negotiating contract terms",
        opening: "open the discussion by outlining the proposed terms"
    },
    mediate_disagreement: {
        tier: "Advanced",
        title: "Mediate a disagreement",
        blurb: "Help two friends work through a disagreement.",
        icon: "⚖️",
        character: "a mutual friend caught in the middle of a disagreement with you",
        opening: "explain your side of the disagreement calmly"
    },
    explain_tech_problem: {
        tier: "Advanced",
        title: "Explain a tech problem to IT",
        blurb: "Describe a computer issue to IT support.",
        icon: "💻",
        character: "an IT support technician taking a help request",
        opening: "greet the caller and ask what problem they're experiencing"
    },
    give_feedback_coworker: {
        tier: "Advanced",
        title: "Give feedback to a coworker",
        blurb: "Deliver constructive feedback on a project.",
        icon: "📝",
        character: "a coworker receiving feedback on their work",
        opening: "respond openly to the feedback and ask clarifying questions"
    },
    explain_insurance_claim: {
        tier: "Advanced",
        title: "Explain an insurance claim",
        blurb: "Walk an agent through the details of a claim.",
        icon: "🧾",
        character: "an insurance agent processing a claim",
        opening: "greet the caller and ask them to describe what happened"
    },
    apologize_mistake: {
        tier: "Advanced",
        title: "Apologize for a work mistake",
        blurb: "Own up to and apologize for an error at work.",
        icon: "🙇",
        character: "a manager receiving an apology for a mistake",
        opening: "respond to the apology thoughtfully and ask what happened"
    },
    discuss_family_plans: {
        tier: "Advanced",
        title: "Discuss future plans with a partner",
        blurb: "Talk through shared plans for the future.",
        icon: "💑",
        character: "a partner discussing future plans together",
        opening: "bring up a topic about your shared future plans"
    },
    negotiate_used_car: {
        tier: "Advanced",
        title: "Negotiate a used car price",
        blurb: "Haggle over the price of a used car.",
        icon: "🚘",
        character: "a used car salesperson",
        opening: "greet the buyer and start discussing the car's price"
    },
    dispute_parking_ticket: {
        tier: "Advanced",
        title: "Dispute a parking ticket",
        blurb: "Explain your case for a parking ticket dispute.",
        icon: "🎫",
        character: "a clerk handling a parking ticket dispute",
        opening: "greet the visitor and ask them to explain their situation"
    },
    discuss_renovation: {
        tier: "Advanced",
        title: "Discuss a home renovation",
        blurb: "Talk through renovation plans with a contractor.",
        icon: "🔨",
        character: "a contractor discussing a home renovation project",
        opening: "greet the homeowner and ask what they have in mind for the renovation"
    },
    best_man_speech: {
        tier: "Advanced",
        title: "Plan a wedding toast",
        blurb: "Talk through ideas for a wedding toast with the couple.",
        icon: "🥂",
        character: "a friend getting married, discussing the upcoming toast",
        opening: "ask excitedly what the other person is planning to say in their toast"
    },
    mentor_junior_colleague: {
        tier: "Advanced",
        title: "Mentor a junior colleague",
        blurb: "Give career advice to someone newer at work.",
        icon: "🎓",
        character: "a junior colleague asking for career advice",
        opening: "ask for advice about navigating early career challenges"
    },
    discuss_diet_plan: {
        tier: "Advanced",
        title: "Discuss a meal plan with a nutritionist",
        blurb: "Talk through healthy eating goals.",
        icon: "🥗",
        character: "a nutritionist discussing balanced eating habits",
        opening: "greet the client and ask about their current eating habits and goals"
    },
    career_change_advice: {
        tier: "Advanced",
        title: "Discuss a career change",
        blurb: "Talk through the idea of changing careers with a mentor.",
        icon: "🧭",
        character: "a mentor discussing a potential career change",
        opening: "ask what's prompting the other person to consider a career change"
    },
    negotiate_freelance_contract: {
        tier: "Advanced",
        title: "Negotiate a freelance contract",
        blurb: "Discuss terms for a freelance project.",
        icon: "📑",
        character: "a client discussing terms for a freelance project",
        opening: "outline the project and ask about availability and rates"
    },
    explain_warranty_claim: {
        tier: "Advanced",
        title: "Explain a warranty claim",
        blurb: "Make the case for a product warranty claim.",
        icon: "🛡️",
        character: "a store employee handling a warranty claim",
        opening: "greet the customer and ask about the issue with their product"
    },
    study_abroad_advisor: {
        tier: "Advanced",
        title: "Discuss study abroad plans",
        blurb: "Talk through options with a study abroad advisor.",
        icon: "🌍",
        character: "an academic advisor discussing study abroad programs",
        opening: "greet the student and ask what they're hoping to get out of studying abroad"
    },
    sports_strategy_coach: {
        tier: "Advanced",
        title: "Debate strategy with a coach",
        blurb: "Discuss game strategy with a sports coach.",
        icon: "⚽",
        character: "a sports coach discussing strategy with a player",
        opening: "ask the player's thoughts on the upcoming game's strategy"
    },
    fundraising_pitch: {
        tier: "Advanced",
        title: "Pitch a fundraising idea",
        blurb: "Present a fundraising idea to a small group.",
        icon: "💡",
        character: "someone listening to a fundraising pitch and asking questions",
        opening: "listen to the pitch and ask a probing follow-up question"
    },
    resolve_scheduling_conflict: {
        tier: "Advanced",
        title: "Resolve a scheduling conflict",
        blurb: "Work out a scheduling conflict between two teams.",
        icon: "🗓️",
        character: "a colleague from another team trying to resolve a scheduling conflict",
        opening: "bring up the scheduling conflict and propose starting to work it out"
    },
    explain_bug_to_client: {
        tier: "Advanced",
        title: "Explain a software bug to a client",
        blurb: "Walk a client through a technical issue.",
        icon: "🐛",
        character: "a client asking about a bug they've encountered",
        opening: "describe the bug they ran into and ask what's going on"
    },
    mortgage_application: {
        tier: "Advanced",
        title: "Discuss a home loan application",
        blurb: "Talk through a mortgage application with a bank officer.",
        icon: "🏦",
        character: "a bank loan officer discussing a mortgage application",
        opening: "greet the applicant and ask about what they're looking for in a home loan"
    },
};

// A learner can also skip the preset scenarios above and describe their own
// topic ("ordering food at a Vietnamese restaurant", "a job interview in
// French") — this reserved id tells /converse to build a scenario from that
// free text instead of looking one up in SCENARIOS.
const CUSTOM_SCENARIO_ID = "custom";
const CUSTOM_TOPIC_MAX_LEN = 200;
const MAX_MESSAGE_LEN = 1000; // per chat message (and per history turn) sent to /converse

// The custom topic goes straight into the system prompt, so it's sanitized
// like any other untrusted client input before that: collapsed to a single
// line (no newlines/control characters that could be used to break out of
// the "this is a topic description" framing) and length-capped. Returns
// null for an empty/whitespace-only topic so the route can reject it.
function buildCustomScenario(topic) {
    const clean = String(topic || "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/[\x00-\x1F\x7F]+/g, " ") // other control characters
        .trim()
        .slice(0, CUSTOM_TOPIC_MAX_LEN);
    if (!clean) return null;
    return {
        tier: "Custom",
        title: clean,
        blurb: clean,
        icon: "✏️",
        character: "a friendly native speaker roleplaying whatever character fits the learner's described scenario",
        opening: "start the conversation naturally, in a way that fits the scenario the learner described"
    };
}

// ==============================
// "Your friend in <language>" — a recurring character who remembers you
// ==============================
// The same character every time, per language, who remembers what the
// learner told them (memory notes kept on the learner's device and synced
// with the rest of their progress) and ends each chat with something to
// follow up on next time ("tomorrowHook") — shown on the home screen and in
// reminder emails, to give a reason to come back tomorrow.
const FRIEND_SCENARIO_ID = "friend";
const FRIEND_MEMORY_MAX = 12;
const FRIEND_NOTE_MAX_LEN = 160;
const FRIENDS = {
    "Spanish": { name: "Lucía", icon: "☕", place: "Madrid", role: "runs a little café in Madrid" },
    "French": { name: "Camille", icon: "📚", place: "Lyon", role: "owns a small bookshop in Lyon" },
    "Italian": { name: "Marco", icon: "🍝", place: "Bologna", role: "cooks at his family's trattoria in Bologna" },
    "German": { name: "Jonas", icon: "🚲", place: "Berlin", role: "fixes bikes in a little shop in Berlin" },
    "Portuguese": { name: "Beatriz", icon: "🎶", place: "Lisbon", role: "plays guitar in a band in Lisbon" },
    "Japanese": { name: "Yuki", icon: "🍵", place: "Osaka", role: "works at a tea shop in Osaka" },
    "Mandarin Chinese": { name: "Li Wei", icon: "🥟", place: "Chengdu", role: "runs a dumpling stall in Chengdu" },
    "Korean": { name: "Minji", icon: "🎧", place: "Seoul", role: "is a graphic designer in Seoul" },
    "Arabic": { name: "Layla", icon: "🌿", place: "Amman", role: "is a nurse in Amman who loves gardening" },
    "Russian": { name: "Dmitri", icon: "♟️", place: "Saint Petersburg", role: "teaches chess in Saint Petersburg" },
    "Hindi": { name: "Priya", icon: "🎨", place: "Jaipur", role: "paints and sells art in Jaipur" },
    "Dutch": { name: "Sanne", icon: "🌷", place: "Utrecht", role: "works at a flower market in Utrecht" },
    "Greek": { name: "Nikos", icon: "⛵", place: "Thessaloniki", role: "runs boat tours from Thessaloniki" },
    "Turkish": { name: "Elif", icon: "🫖", place: "Izmir", role: "runs a tea garden in Izmir" },
    "Polish": { name: "Kasia", icon: "🥐", place: "Kraków", role: "bakes at a bakery in Kraków" },
    "Swedish": { name: "Erik", icon: "🌲", place: "Gothenburg", role: "is a forest guide near Gothenburg" },
    "Vietnamese": { name: "Linh", icon: "🛵", place: "Hanoi", role: "runs a food tour in Hanoi" },
    "Thai": { name: "Ploy", icon: "🌶️", place: "Chiang Mai", role: "teaches cooking classes in Chiang Mai" },
    "Indonesian": { name: "Dewi", icon: "🏄", place: "Bali", role: "teaches surfing in Bali" },
    "Hebrew": { name: "Noa", icon: "🎬", place: "Tel Aviv", role: "edits films in Tel Aviv" },
    "Ukrainian": { name: "Oksana", icon: "🌻", place: "Lviv", role: "runs a coffee roastery in Lviv" },
    "Romanian": { name: "Andrei", icon: "🏔️", place: "Brașov", role: "leads mountain hikes near Brașov" },
    "Czech": { name: "Tomáš", icon: "🎻", place: "Prague", role: "plays violin in Prague" },
    "Hungarian": { name: "Réka", icon: "♨️", place: "Budapest", role: "works at a thermal bath in Budapest" },
    "Finnish": { name: "Aino", icon: "🧖", place: "Tampere", role: "is a librarian in Tampere who loves saunas" },
    "Norwegian": { name: "Lars", icon: "🎣", place: "Bergen", role: "is a fisherman in Bergen" },
    "Danish": { name: "Freja", icon: "🧶", place: "Aarhus", role: "designs knitwear in Aarhus" },
    "Filipino": { name: "Paolo", icon: "🏀", place: "Cebu", role: "coaches basketball in Cebu" },
    "Swahili": { name: "Amani", icon: "🦒", place: "Arusha", role: "is a safari guide in Arusha" },
    "Persian": { name: "Darya", icon: "📜", place: "Shiraz", role: "teaches poetry in Shiraz" },
    "Urdu": { name: "Ayesha", icon: "🧵", place: "Lahore", role: "is a fashion designer in Lahore" },
    "Bengali": { name: "Rahul", icon: "📷", place: "Kolkata", role: "is a street photographer in Kolkata" },
    "Malay": { name: "Aisyah", icon: "🍜", place: "Penang", role: "runs a noodle stall in Penang" },
    "Punjabi": { name: "Harpreet", icon: "🥁", place: "Amritsar", role: "drums in a bhangra group in Amritsar" }
};
function friendFor(language) {
    return FRIENDS[language] || { name: "Sam", icon: "👋", place: "", role: "lives in a city where people speak this language" };
}
// What the app needs to show the friend on the home screen.
function publicFriend(language) {
    const f = friendFor(language);
    return { name: f.name, icon: f.icon, place: f.place, role: f.role };
}
function cleanPromptLine(value, max) {
    return String(value || "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/[\x00-\x1F\x7F]+/g, " ")
        .trim()
        .slice(0, max);
}
// Memory notes and the hook come from the client (they're the learner's
// own data), so they're cleaned like any other untrusted prompt input.
function buildFriendScenario(language, memory, hook) {
    const f = friendFor(language);
    const notes = (Array.isArray(memory) ? memory : [])
        .map(n => cleanPromptLine(n, FRIEND_NOTE_MAX_LEN))
        .filter(Boolean)
        .slice(0, FRIEND_MEMORY_MAX);
    const cleanHook = cleanPromptLine(hook, FRIEND_NOTE_MAX_LEN);
    return {
        tier: "Custom",
        title: `Chat with ${f.name}`,
        blurb: `A relaxed catch-up between two friends: you are ${f.name}, who ${f.role}, chatting with the learner about your lives.`,
        icon: f.icon,
        character: `${f.name}, a warm, curious friend of the learner who ${f.role}`,
        opening: notes.length
            ? `greet them like a friend you're happy to see again, and follow up on something you remember about them${cleanHook ? ` (you were planning to ask about this: "${cleanHook}")` : ""}`
            : `introduce yourself warmly as ${f.name}, say one small thing about your life${f.place ? ` in ${f.place}` : ""}, and ask them about themselves`,
        friend: { name: f.name, notes }
    };
}
function friendPromptSection(scenario, nativeLanguage) {
    const fr = scenario.friend;
    const remembered = fr.notes.length
        ? `What you remember from earlier chats with the learner (lines starting "Me:" are things you said about your own life — stay consistent with them):\n${fr.notes.map(n => `- ${n}`).join("\n")}`
        : `This is the first time you and the learner are chatting.`;
    return `\n\nYou are a recurring character: the learner comes back to chat with you on different days, like a real friend.\n${remembered}\n\n- Be a real friend, not an interviewer: react to what they say, share small, everyday things from your own life, and ask about theirs. Bring up things you remember when it's natural.\n- "memoryNotes": the complete, updated list (at most ${FRIEND_MEMORY_MAX} short notes, in ${nativeLanguage}) of lasting things worth remembering for next time — facts the learner has told you about themselves (name, where they live, work or studies, family, hobbies, upcoming plans and events) plus, prefixed with "Me:", anything you've said about your own life. Keep earlier notes unless the learner corrected them; when the list is full, drop the least useful. Only note what the learner actually said — never guess. Leave out anything sensitive (health, money, religion, politics, relationships' private details).\n- "tomorrowHook": one short, friendly sentence in ${nativeLanguage}, written in the third person, about what you'll want to ask or tell them next time, ideally following up on something they mentioned — e.g. "${fr.name} wants to hear how your job interview went." It's shown to the learner as a teaser to come back.`;
}

// Languages the model can roleplay in without any extra setup — this list
// is just what's offered in the UI dropdown; adding another language later
// is a one-line addition here, not new content to write (buildSystemPrompt
// below builds the roleplay instructions dynamically for whichever language
// is selected).
const LANGUAGES = [
    "Spanish", "French", "Italian", "German", "Portuguese", "Japanese",
    "Mandarin Chinese", "Korean", "Arabic", "Russian", "Hindi", "Dutch",
    "Greek", "Turkish", "Polish", "Swedish", "Vietnamese", "Thai", "Indonesian", "Hebrew",
    // Added so the app matches the 34 languages the landing page lists (the
    // app already had voices, greetings and labels for all of these).
    "Ukrainian", "Romanian", "Czech", "Hungarian", "Finnish", "Norwegian", "Danish",
    "Filipino", "Swahili", "Persian", "Urdu", "Bengali", "Malay", "Punjabi"
];

// Every language a learner can pick as the one THEY already speak — every
// learning language works both ways (a French speaker can learn Spanish,
// a Spanish speaker can learn French), plus English since this app didn't
// originally assume every learner speaks it. Defaults to "English" so
// existing learners who've never touched this setting see no change.
const NATIVE_LANGUAGES = ["English", ...LANGUAGES];
const DEFAULT_NATIVE_LANGUAGE = "English";
function normalizeNativeLanguage(value) {
    return NATIVE_LANGUAGES.includes(value) ? value : DEFAULT_NATIVE_LANGUAGE;
}

// Languages not ordinarily written in the Latin alphabet — for these, every
// prompt below also asks the model for a "romanization" alongside the
// ${language} text (Hanyu Pinyin for Mandarin, Hepburn romaji for Japanese,
// etc.) so a learner who can't yet read the native script has something to
// sound the word out with. Left as an empty string by the model for every
// other language.
const NON_LATIN_SCRIPT_LANGUAGES = new Set([
    "Japanese", "Mandarin Chinese", "Korean", "Arabic", "Russian", "Hindi", "Greek", "Thai", "Hebrew",
    "Ukrainian", "Persian", "Urdu", "Bengali", "Punjabi"
]);
// A sound-it-out respelling shown in brackets next to each key phrase, e.g.
// Dutch "Hallo" (HAH-loh). Written for the learner's own language, since
// "how it sounds" depends on which spelling rules the reader already knows.
function pronunciationNote(language, nativeLanguage) {
    return `Each "keyPhrases" entry also needs a "pronunciation" field: a simple sound-it-out respelling of the ${language} phrase for a ${nativeLanguage} speaker, using ordinary ${nativeLanguage} spelling (never IPA symbols), syllables separated by hyphens and the stressed syllable in CAPITALS, words separated by spaces. Examples for an English speaker: Dutch "Hallo" → "HAH-loh", French "Bonjour" → "bohn-ZHOOR", Spanish "Gracias" → "GRAH-syahs", Japanese "Arigatou" → "ah-ree-GAH-toh".`;
}

function romanizationNote(language) {
    return NON_LATIN_SCRIPT_LANGUAGES.has(language)
        ? ` ${language} isn't usually written in the Latin alphabet, so also give its standard romanization (e.g. Hanyu Pinyin for Mandarin, Hepburn romaji for Japanese, Revised Romanization for Korean) in the matching "...Romanization" field.`
        : ` ${language} is written in the Latin alphabet, so leave the matching "...Romanization" field as an empty string.`;
}

// `objectives` (from /lesson-intro, echoed back by the client on every
// /converse call) turns this from an open-ended chat into something with a
// goal: the model is asked to grade the learner's progress against them each
// turn, not just reply in character.
//
// `keyPhrases` (from /lesson-intro) is the short list of exact phrases the
// learner was shown on THIS lesson's intro screen before the chat started.
// `vocabHistory` is the union of keyPhrases from every OTHER lesson in this
// language the learner has already completed, in this same language — i.e.
// everything they'd have been taught by this point in the course, before
// today's lesson. Together they're used below to keep every conversation,
// at every tier, grounded in words the learner has actually seen rather
// than whatever the model feels like reaching for.
//
// `feedbackMode` (optional, from the client each turn):
//   retrying    — the previous AI turn was a "nudge" (see feedbackRules), so
//                 this message is the learner's second try at fixing it.
//   replayRound — this is a "Run it again, faster" repeat of a scenario the
//                 learner just finished; keep momentum, never nudge.
//
// Why nudges at all: language-learning research consistently finds that
// prompting a learner to fix their own mistake ("Almost — check the verb")
// teaches more than simply showing them the corrected sentence, because they
// have to retrieve the right form themselves. The answer is still one tap
// away ("nudgeAnswer"), and the learner is never nudged twice in a row.
function feedbackRules(language, nativeLanguage, { allowNudge, retrying, replayRound }) {
    const shared = `\n- The learner's message will be exactly "__START__" only to signal the very start of the conversation — on that turn "feedbackType" is "none", "tip" is "" and "nudgeAnswer" is "".\n- If the learner writes in ${nativeLanguage} or seems stuck, stay in character in ${language} but simplify your reply, and use "tip" to gently suggest a phrase they could use ("feedbackType": "correction").\n- Never put coaching inside "reply" — that field is 100% in-character. "nudgeAnswer" is "" unless "feedbackType" is "nudge".`;

    if (retrying) {
        return `\n\nFeedback rules for this turn (set "feedbackType", "tip" and "nudgeAnswer" together):\n- Your previous turn nudged the learner to fix a mistake themselves, and this message is their second try. Now respond to what they said in character and move the conversation forward normally — no more asking them to repeat.\n- If they fixed the mistake (near enough counts): "feedbackType" is "fixed" and "tip" is a very short, specific bit of praise in ${nativeLanguage} naming what they got right (e.g. "Nice fix — "tengo" is exactly right!").\n- If it's still wrong: "feedbackType" is "correction" and "tip" kindly shows the correct way in at most 2 short sentences (e.g. "Close! It's "tengo hambre" — you'll nail it next time."). Never nudge twice in a row.\n- If their retry was fine but something else in it was off, you may mention that instead, as a "correction".${shared}`;
    }

    if (!allowNudge) {
        const replayNote = replayRound
            ? `\n- This is a REPLAY ROUND: the learner already finished this exact scenario once and is redoing it faster to build fluency. Keep your replies brisk and natural and keep the conversation moving. Only use "tip" for a real mistake, and keep it to ONE short sentence showing the right way — no hints to try again, momentum matters more here.`
            : "";
        return `\n\nFeedback rules (set "feedbackType", "tip" and "nudgeAnswer" together):${replayNote}\n- Look at the learner's last message (in ${language}). If anything was unnatural, grammatically off, or not how a native speaker would actually say it, put ONE short, specific, encouraging coaching note in "tip" (${nativeLanguage}, max 2 sentences) — show what they said and a more natural way to say it — and set "feedbackType" to "correction". If their message was already good, set "feedbackType" to "none" and leave "tip" as an empty string.\n- Never use "nudge" or "fixed" in this conversation. If a rule further below fills "tip" every turn, "feedbackType" is "correction" whenever "tip" isn't empty.${shared}`;
    }

    return `\n\nFeedback rules (set "feedbackType", "tip" and "nudgeAnswer" together). Look at the learner's last message (in ${language}) and sort any problem into one of two kinds:\n(a) A real MISTAKE — wrong word, wrong verb form or tense, wrong gender or agreement, word order that sounds wrong, or a missing word: something a native speaker would clearly notice as an error.\n(b) Only UNNATURAL — understandable and grammatically fine, just not how a native speaker would usually put it.\n\n- For a real MISTAKE: "feedbackType" is "nudge". Do NOT give the answer in "tip". Instead, in ${nativeLanguage} and at most 2 short sentences, point to where the problem is (quote the part to look at) and give a hint so they can fix it themselves, then invite them to try again — e.g. "Almost! Look at "yo tiene" — how does tener change when you're talking about yourself? Try again." Put the full corrected version of their whole message in "nudgeAnswer" (the learner only sees it if they tap to reveal it). Pick only the single most important mistake. In "reply", stay in character with a very short, natural reaction asking them to say it again, the way a real person who didn't quite catch it would (a natural "Sorry?" / "Pardon, what was that?" in ${language}) — do NOT answer their message or move the conversation forward on this turn.\n- For something only UNNATURAL: "feedbackType" is "correction". Reply normally in character, and in "tip" (${nativeLanguage}, max 2 sentences) show what they said and a more natural way to say it.\n- If their message was good: "feedbackType" is "none" and "tip" is "".${shared}`;
}

function buildSystemPrompt(language, scenario, objectives, keyPhrases, vocabHistory, nativeLanguage, feedbackMode) {
    const mode = feedbackMode || {};
    const hasObjectives = Array.isArray(objectives) && objectives.length > 0;
    const objectivesSection = hasObjectives
        ? `\n\nThis conversation also has a short list of lesson objectives the learner is trying to accomplish:\n${objectives.map((o, i) => `${i}. ${o}`).join("\n")}\nAfter the learner's latest message, and considering the whole conversation so far (not just this one message), decide which of these objectives (by their 0-based index above) have now been reasonably satisfied — be a little generous about it, not a strict grader; near enough counts. Once an objective is satisfied, keep including its index in every later turn too, even if the conversation has moved on. Put the full, cumulative list of satisfied indices in "completedObjectives" (empty array if none yet).`
        : `\n\nThere are no lesson objectives being tracked for this conversation — always return an empty array for "completedObjectives".`;

    const safeKeyPhrases = Array.isArray(keyPhrases) ? keyPhrases : [];
    const safeVocabHistory = Array.isArray(vocabHistory) ? vocabHistory : [];
    const allKnownPhrases = [...safeKeyPhrases, ...safeVocabHistory];

    // Intro-tier lessons are for someone who may know zero words of the
    // language yet — a normal roleplay turn (where the learner is expected to
    // produce a reply on their own) doesn't work for them. So instead of the
    // usual "correct them after the fact" coaching, the tutor hands over the
    // exact phrase to try BEFORE expecting a response, every single turn, and
    // "reply" is held to a hard allowlist of exactly what's been taught so
    // far (this lesson's phrases plus every earlier basics lesson).
    // The milestone capstone ("Your First Real Conversation") is the one
    // Intro lesson that must NOT use the one-phrase allowlist: its whole point
    // is a genuine back-and-forth, so a reply that ignores what the learner
    // just said (e.g. answering "Do you like coffee?" with "See you later")
    // defeats it. It gets its own gentle-but-responsive guidance below.
    const isMilestone = !!scenario.milestone;
    const isIntro = scenario.tier === "Intro" && !isMilestone;
    const hasKnownPhrases = allKnownPhrases.length > 0;
    const knownPhrasesList = hasKnownPhrases
        ? allKnownPhrases.map(p => `- ${p.phrase} (${p.translation})`).join("\n")
        : "";

    let levelGuidance = "";
    if (isMilestone) {
        levelGuidance = `\n\nThis is the learner's FIRST real conversation in ${language} — a celebration capstone after the basics lessons, so they are a complete beginner.${hasKnownPhrases ? ` These are the ${language} phrases they have been taught so far:\n${knownPhrasesList}` : ""}\n\nHard rules for this conversation (they override the usual "reply" and "tip" rules above):\n- Have a genuine, warm back-and-forth. ALWAYS respond to what the learner actually just said — answer their question, react to their name, where they're from or what they like, then ask ONE simple follow-up question. Never reply with a stock phrase that ignores their message.\n- Keep "reply" very short and simple: 1-2 short sentences built mostly from the phrases above plus only the most basic connecting words (yes/no, I, you, very, too, and, also). No idioms, no complex grammar, no long sentences.\n- If they say goodbye, say a warm goodbye back.\n- "tip": leave it empty when their message was fine. If something was off, give ONE gentle, simple fix in ${nativeLanguage}. If they seem stuck, suggest one phrase to try. Whenever "tip" includes a ${language} phrase, follow it with a simple sound-it-out pronunciation in brackets (syllables separated by hyphens, stressed syllable in CAPITALS, no IPA), e.g. "Try: ¿De dónde eres? (deh DOHN-deh EH-rehs) — Where are you from?". No grammar jargon, max 2 short sentences.\n- Be encouraging — this is a big moment for them.`;
    } else if (isIntro) {
        levelGuidance = `\n\nThis is a BASICS lesson — assume the learner may not know any ${language} yet. This overrides the usual "reply" and "tip" rules above.${hasKnownPhrases ? `\n\nThe learner has been shown this exact, complete list of ${language} phrases so far — this lesson's phrases plus every earlier basics lesson they've already completed — and nothing else:\n${knownPhrasesList}\n\nHard rules for "reply" in this lesson:\n- Use ONLY the phrases above (plus a name the learner gives you) — never introduce a new word, verb form, or sentence structure that isn't on that list.\n- "reply" must be just ONE short phrase from that list, standing alone — a greeting or exclamation, not a full sentence explaining what to say or how to say it (no "you can say...", no connecting clauses). Someone meeting this word for the very first time needs to see it used plainly, not embedded in a bigger sentence.` : `\n\nKeep "reply" itself to one very short, simple phrase — no subordinate clauses or explaining what to say, just a plain in-character reaction.`}\n- Every turn in this lesson, including the very first ("__START__") turn, use "tip" to explicitly hand them the next phrase to try — the exact ${language} phrase, then in brackets a simple sound-it-out pronunciation for a ${nativeLanguage} speaker (syllables separated by hyphens, stressed syllable in CAPITALS, no IPA symbols), then its ${nativeLanguage} meaning, e.g. "Try saying: ¡Hola! (OH-lah) — it means Hello." Never leave "tip" empty in this lesson, not even on a good attempt or the first turn — there should always be a next phrase to try. That's the only field where any teaching or explaining happens — never inside "reply".\n- If the phrase doesn't obviously follow from what's just been said — teaching a standalone word like "yes" or "mother" right after a greeting can otherwise feel like a random vocabulary drop — ground "tip" with one short, natural reason it's useful instead of just a bare translation, e.g. "Try saying: sí — it means yes. You'll use it constantly to answer simple questions." Keep "tip" to at most 2 short sentences either way.\n- Keep the language in "tip" itself dead simple — short sentences, everyday words, no grammar jargon (never terms like "conjugation", "accusative", "infinitive", etc.) — write it the way you'd patiently explain something to someone on their very first day of ever learning a language.\n- Be warm, patient, and encouraging about any attempt, even an imperfect one — talk to them like a supportive first-day teacher, not a native speaker in a hurry. The vocabulary being minimal doesn't mean the tone should be flat.`;
    } else if (hasKnownPhrases) {
        // Beyond the intro track, a hard allowlist gets unworkable fast (by
        // lesson 20+ it's a huge fixed phrase list and every reply starts
        // sounding the same) — so this is a soft ceiling instead: stay close
        // to what's actually been taught, but allow the ordinary grammar and
        // connecting words needed to build a real sentence at this level.
        // Custom (learner-typed) topics aren't a real difficulty tier, so
        // "at a custom level" would read oddly — falls back to a level-
        // agnostic phrasing for those.
        const levelPhrase = scenario.tier === "Custom" ? "at their current level" : `at a ${scenario.tier.toLowerCase()} level`;
        levelGuidance = `\n\nThe learner has completed earlier lessons in ${language}, and between those and this lesson's own key phrases has been taught this vocabulary so far:\n${knownPhrasesList}\n\nUse this as a guide, not a strict allowlist: lean on these words where they naturally fit, and it's fine to use ordinary grammar and connecting words (articles, basic verb conjugations, pronouns, prepositions, common function words) needed to form a natural sentence ${levelPhrase}. But don't reach for advanced or obscure vocabulary the learner hasn't been shown any equivalent of yet just because it fits the scenario well — when in doubt, prefer the simpler word a learner at this point in the course would actually recognize.`;
    }

    return `You are roleplaying as ${scenario.character}, to help someone practice having a real, natural conversation in ${language}. Scenario: ${scenario.blurb}

Rules for every turn:
- Stay fully in character. Write "reply" ONLY in ${language} — short (1-3 sentences), natural, everyday phrasing a real native speaker would actually use in this situation, not textbook-formal language.
- "replyTranslation" is a plain ${nativeLanguage} translation of exactly what you wrote in "reply", so the learner can check their understanding. Never put ${nativeLanguage} in "reply" itself.
- "replyRomanization" is the romanization of exactly what you wrote in "reply", following the rule below — leave it as an empty string when that rule says to.${romanizationNote(language)}
- The learner's message will be exactly "__START__" only to signal the very start of the conversation — when you see that, ${scenario.opening}, as your character naturally would. Never mention "__START__" or break character to acknowledge it.${feedbackRules(language, nativeLanguage, {
        // Absolute beginners (Intro tier, and the first-conversation
        // milestone) get the answer handed to them every time — a "fix it
        // yourself" hint only works once there's something to retrieve.
        allowNudge: !isIntro && !isMilestone && !mode.replayRound && !mode.retrying,
        retrying: !!mode.retrying && !isIntro && !isMilestone && !mode.replayRound,
        replayRound: !!mode.replayRound
    })}${levelGuidance}${objectivesSection}${scenario.friend ? friendPromptSection(scenario, nativeLanguage) : ""}`;
}

const CONVERSATION_JSON_SCHEMA = {
    type: "json_schema",
    name: "conversation_turn",
    strict: true,
    schema: {
        type: "object",
        properties: {
            reply: { type: "string" },
            replyTranslation: { type: "string" },
            replyRomanization: { type: "string" },
            tip: { type: "string" },
            // "nudge" = learner made a real mistake and is asked to fix it
            // themselves (answer held back in nudgeAnswer); "fixed" = they
            // just fixed a nudged mistake; "correction" = ordinary coaching
            // tip; "none" = no tip. See feedbackRules.
            feedbackType: { type: "string", enum: ["none", "nudge", "fixed", "correction"] },
            nudgeAnswer: { type: "string" },
            completedObjectives: { type: "array", items: { type: "integer" } }
        },
        required: ["reply", "replyTranslation", "replyRomanization", "tip", "feedbackType", "nudgeAnswer", "completedObjectives"],
        additionalProperties: false
    }
};

// The friend chat returns everything a normal turn does, plus the updated
// memory and the "next time" teaser (see friendPromptSection).
const FRIEND_CONVERSATION_JSON_SCHEMA = {
    type: "json_schema",
    name: "friend_conversation_turn",
    strict: true,
    schema: {
        ...CONVERSATION_JSON_SCHEMA.schema,
        properties: {
            ...CONVERSATION_JSON_SCHEMA.schema.properties,
            memoryNotes: { type: "array", items: { type: "string" } },
            tomorrowHook: { type: "string" }
        },
        required: [...CONVERSATION_JSON_SCHEMA.schema.required, "memoryNotes", "tomorrowHook"]
    }
};

// ==============================
// Lesson intro
// ==============================
// Generated once, right before a lesson starts, so the learner sees a goal
// and a few useful phrases before diving into an open chat — rather than
// tapping a lesson and landing straight in a blank conversation. Objectives
// are generated here (not stored per-scenario) for the same reason
// buildSystemPrompt generates dialogue dynamically: no per-scenario,
// per-language content to hand-author and keep in sync across 90 lessons.
function buildLessonIntroPrompt(language, scenario, nativeLanguage) {
    const romanizationLine = `Each "keyPhrases" entry also needs a "romanization" field.${romanizationNote(language)} ${pronunciationNote(language, nativeLanguage)}`;
    if (scenario.tier === "Intro") {
        return `The learner is an absolute beginner about to learn some of their very first words of ${language}, on this topic: ${scenario.blurb}

- "objectives": exactly 3 short, concrete goals for this lesson (in ${nativeLanguage}, each under 8 words, phrased like a checklist item) — focused on LEARNING and trying out new words on this topic, not on accomplishing a task (e.g. "Learn to say hello", "Learn to say goodbye", "Try greeting the tutor").
- "keyPhrases": 5 to 8 essential ${language} words or phrases for this specific topic, each with its plain ${nativeLanguage} translation — exactly the vocabulary this lesson is meant to teach, simple and commonly used, ordered from most to least essential. ${romanizationLine}`;
    }
    return `The learner is about to practice this scenario in ${language}: ${scenario.blurb} They'll be roleplaying with ${scenario.character}.

- "objectives": exactly 3 short, concrete goals for what the learner should try to accomplish during this conversation (in ${nativeLanguage}, each under 8 words, phrased like a checklist item — e.g. "Greet the barista", "Order a drink", "Ask the price"). Make them specific to this scenario, not generic filler.
- "keyPhrases": 4 to 6 short, useful phrases in ${language} the learner will likely want for this scenario, each with its plain ${nativeLanguage} translation — natural, everyday phrasing a native speaker would actually use, not textbook-formal. ${romanizationLine}`;
}

const LESSON_INTRO_JSON_SCHEMA = {
    type: "json_schema",
    name: "lesson_intro",
    strict: true,
    schema: {
        type: "object",
        properties: {
            objectives: { type: "array", items: { type: "string" } },
            keyPhrases: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        phrase: { type: "string" },
                        translation: { type: "string" },
                        romanization: { type: "string" },
                        pronunciation: { type: "string" }
                    },
                    required: ["phrase", "translation", "romanization", "pronunciation"],
                    additionalProperties: false
                }
            }
        },
        required: ["objectives", "keyPhrases"],
        additionalProperties: false
    }
};

// ==============================
// Lesson practice round
// ==============================
// Generated once, right alongside the lesson intro, so the learner does a
// short warm-up of structured exercises BEFORE the open-ended roleplay chat
// — multiple choice, fill-in-the-blank, word-bank sentence building, true/
// false, and matching, one of each so every lesson mixes it up rather than
// being five multiple-choice questions in a row. Generated per-request for
// the same reason buildLessonIntroPrompt is: no per-scenario, per-language
// content to hand-author and keep in sync across 100 lessons.
function buildLessonPracticePrompt(language, scenario, nativeLanguage) {
    const isIntro = scenario.tier === "Intro";
    const levelNote = isIntro
        ? `The learner is an absolute beginner — keep every word and sentence extremely simple, using only vocabulary a total beginner would already have been taught for this exact topic.`
        : `The learner already knows some ${language} — keep vocabulary and sentence complexity appropriate for a ${scenario.tier.toLowerCase()}-level learner.`;
    const rz = romanizationNote(language);

    return `Before roleplaying this scenario in ${language}, the learner does a short warm-up practice round testing vocabulary and phrases for this topic: ${scenario.blurb}
${levelNote}
The learner's own native language, for every translation/instruction below, is ${nativeLanguage}.

Generate exactly 5 practice exercises, one of each of these types, in this exact order: "multiple_choice", "fill_blank", "word_bank", "true_false", "matching". Every exercise must be tightly focused on vocabulary and phrases relevant to this specific topic, and each exercise's "kind" field must be set to exactly the matching type name below.

- multiple_choice: "prompt" is a short ${language} word or phrase. "options" is an array of exactly 4 short ${nativeLanguage} translations, only one of which is correct. "correctIndex" is the 0-based index of the correct option. "promptRomanization" is "prompt"'s romanization.${rz}
- fill_blank: "sentence" is a short ${language} sentence with exactly one blank shown as "___". "correctAnswer" is the single ${language} word or short phrase that correctly fills the blank. "translation" is the ${nativeLanguage} translation of the complete, correct sentence. "sentenceRomanization" is the romanization of the complete, correct ${language} sentence (with the blank filled in).${rz}
- word_bank: "prompt" is a short ${nativeLanguage} sentence. "words" is that sentence's ${language} translation split into individual words/tokens, given in SCRAMBLED (shuffled) order. "correctOrder" is an array of the same length giving the 0-based indices into "words" that puts them back into a grammatically correct ${language} sentence. "wordsRomanization" is an array the same length as "words", giving the romanization of each entry in "words" at the same index (not reordered).${rz}
- true_false: "statement" is one ${nativeLanguage} sentence claiming that a specific ${language} word or phrase means something — sometimes make the claim true, sometimes false. "isTrue" is whether the claim is actually correct.
- matching: "pairs" is an array of exactly 4 objects, each with a "term" (a ${language} word or phrase for this topic), its "meaning" (the correct ${nativeLanguage} translation), and "termRomanization" (the romanization of "term").${rz}

Every exercise also needs a short "instruction" field in plain ${nativeLanguage} telling the learner what to do, e.g. "Choose the correct meaning", "Fill in the blank", "Put the words in order", "True or false?", "Match each word to its meaning".`;
}

const PRACTICE_JSON_SCHEMA = {
    type: "json_schema",
    name: "lesson_practice",
    strict: true,
    schema: {
        type: "object",
        properties: {
            exercises: {
                type: "array",
                items: {
                    anyOf: [
                        {
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["multiple_choice"] },
                                instruction: { type: "string" },
                                prompt: { type: "string" },
                                promptRomanization: { type: "string" },
                                options: { type: "array", items: { type: "string" } },
                                correctIndex: { type: "integer" }
                            },
                            required: ["kind", "instruction", "prompt", "promptRomanization", "options", "correctIndex"],
                            additionalProperties: false
                        },
                        {
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["fill_blank"] },
                                instruction: { type: "string" },
                                sentence: { type: "string" },
                                sentenceRomanization: { type: "string" },
                                correctAnswer: { type: "string" },
                                translation: { type: "string" }
                            },
                            required: ["kind", "instruction", "sentence", "sentenceRomanization", "correctAnswer", "translation"],
                            additionalProperties: false
                        },
                        {
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["word_bank"] },
                                instruction: { type: "string" },
                                prompt: { type: "string" },
                                words: { type: "array", items: { type: "string" } },
                                wordsRomanization: { type: "array", items: { type: "string" } },
                                correctOrder: { type: "array", items: { type: "integer" } }
                            },
                            required: ["kind", "instruction", "prompt", "words", "wordsRomanization", "correctOrder"],
                            additionalProperties: false
                        },
                        {
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["true_false"] },
                                instruction: { type: "string" },
                                statement: { type: "string" },
                                isTrue: { type: "boolean" }
                            },
                            required: ["kind", "instruction", "statement", "isTrue"],
                            additionalProperties: false
                        },
                        {
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["matching"] },
                                instruction: { type: "string" },
                                pairs: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            term: { type: "string" },
                                            termRomanization: { type: "string" },
                                            meaning: { type: "string" }
                                        },
                                        required: ["term", "termRomanization", "meaning"],
                                        additionalProperties: false
                                    }
                                }
                            },
                            required: ["kind", "instruction", "pairs"],
                            additionalProperties: false
                        }
                    ]
                }
            }
        },
        required: ["exercises"],
        additionalProperties: false
    }
};

// ==============================
// Phrase lookup
// ==============================
// A learner can search any word, phrase, or saying while inside a lesson —
// separate from the roleplay conversation itself, so it needs its own
// prompt/schema rather than reusing buildSystemPrompt/CONVERSATION_JSON_SCHEMA.
function buildLookupPrompt(language, nativeLanguage) {
    const rz = romanizationNote(language);
    return `The learner is studying ${language} and their own native language is ${nativeLanguage}. They will send a short word, phrase, or saying — it may be written in ${nativeLanguage} or in ${language}.

- "translation": if what they sent is in ${nativeLanguage}, translate it into natural, everyday ${language} — how a native speaker would actually say it in conversation, not a stiff word-for-word translation. If what they sent is already in ${language}, translate it into natural ${nativeLanguage} instead.
- "phraseRomanization": the romanization of what they searched, ONLY if what they searched was itself written in ${language} (leave as an empty string if they searched in ${nativeLanguage}, or if ${language} doesn't need one).${rz}
- "translationRomanization": the romanization of the "translation" field, ONLY if "translation" ended up in ${language} (leave as an empty string if "translation" ended up in ${nativeLanguage}, or if ${language} doesn't need one).${rz}
- "relatedPhrases": give 4 to 6 other short, useful phrases or sayings in ${language} that are related in topic or would come up in the same kind of conversation as what they searched — each with its plain ${nativeLanguage} translation and its "romanization" field.${rz} These should genuinely help the learner go deeper on the topic they searched, not just be random unrelated phrases.`;
}

const LOOKUP_JSON_SCHEMA = {
    type: "json_schema",
    name: "phrase_lookup",
    strict: true,
    schema: {
        type: "object",
        properties: {
            translation: { type: "string" },
            phraseRomanization: { type: "string" },
            translationRomanization: { type: "string" },
            relatedPhrases: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        phrase: { type: "string" },
                        translation: { type: "string" },
                        romanization: { type: "string" }
                    },
                    required: ["phrase", "translation", "romanization"],
                    additionalProperties: false
                }
            }
        },
        required: ["translation", "phraseRomanization", "translationRomanization", "relatedPhrases"],
        additionalProperties: false
    }
};

// Words too common to be useful signal when matching a searched phrase
// against scenario titles/blurbs (kept short and generic on purpose — this
// only needs to filter noise, not be a linguistically complete stopword list).
const LOOKUP_STOPWORDS = new Set([
    "the", "a", "an", "to", "of", "in", "on", "for", "with", "is", "are", "was", "were",
    "i", "you", "he", "she", "it", "we", "they", "my", "your", "his", "her", "our", "their",
    "how", "do", "does", "did", "and", "or", "but", "at", "about", "this", "that", "these", "those",
    "can", "could", "would", "should", "will", "what", "where", "when", "who", "why", "please",
    "me", "us", "them", "be", "am", "as", "so", "very", "just", "like"
]);

function tokenizeForMatch(text) {
    return (text || "")
        .toLowerCase()
        .match(/[a-zà-öø-ÿ']+/g) || [];
}

// Deliberately NOT an AI call — asking a model to pick one lesson out of 90
// by id is unreliable and costs an extra request for every lookup. Simple
// local keyword overlap against each scenario's title/blurb is fast, free,
// and good enough to point the learner somewhere relevant. Matches against
// both the searched phrase and its translation so it works regardless of
// which language the learner searched in.
function findRelatedLesson(matchText, excludeScenarioId) {
    const queryWords = new Set(
        tokenizeForMatch(matchText).filter(w => w.length > 2 && !LOOKUP_STOPWORDS.has(w))
    );
    if (queryWords.size === 0) return null;

    let best = null;
    let bestScore = 0;
    for (const [id, s] of Object.entries(SCENARIOS)) {
        if (id === excludeScenarioId) continue;
        const scenarioWords = tokenizeForMatch(`${s.title} ${s.blurb}`);
        let score = 0;
        for (const w of scenarioWords) {
            if (queryWords.has(w)) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            best = { id, tier: s.tier, title: s.title, icon: s.icon };
        }
    }
    return best;
}

// ==============================
// Health check
// ==============================
app.get("/", (req, res) => {
    res.json({ status: "online", app: "Echoly" });
});

app.get("/scenarios", (req, res) => {
    const list = Object.entries(SCENARIOS).map(([id, s]) => ({
        id, tier: s.tier, title: s.title, blurb: s.blurb, icon: s.icon,
        unlockAfter: s.unlockAfter || undefined, milestone: s.milestone || undefined
    }));
    const friends = {};
    LANGUAGES.forEach(l => { friends[l] = publicFriend(l); });
    res.json({ scenarios: list, languages: LANGUAGES, nativeLanguages: NATIVE_LANGUAGES, friends });
});

// ==============================
// Landing-page demo chat
// ==============================
// A tiny, three-message taste of Echoly right in the landing page's hero —
// most ad visitors leave within seconds, so the first thing they can do is
// actually talk, without signing up or even leaving the page. Deliberately
// cheap: short replies, at most DEMO_MAX_TURNS learner messages (the client
// then hands off to the real app), its own per-IP cap, no accounts, and it
// doesn't touch anyone's daily conversation allowance.
const DEMO_MAX_TURNS = 3;
const DEMO_MAX_MESSAGE_LEN = 200;
const demoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "That's the demo for now — open the app to keep talking." }
});
const DEMO_JSON_SCHEMA = {
    type: "json_schema",
    name: "demo_turn",
    strict: true,
    schema: {
        type: "object",
        properties: {
            reply: { type: "string" },
            replyTranslation: { type: "string" },
            tip: { type: "string" },
            suggestions: {
                type: "array",
                items: {
                    type: "object",
                    properties: { phrase: { type: "string" }, translation: { type: "string" } },
                    required: ["phrase", "translation"],
                    additionalProperties: false
                }
            }
        },
        required: ["reply", "replyTranslation", "tip", "suggestions"],
        additionalProperties: false
    }
};
function buildDemoPrompt(language, turnsLeft) {
    return `You are a friendly barista at a small neighbourhood café, chatting with a visitor who probably knows almost no ${language}. This is a quick 3-message taste of practicing a real conversation, so make it EASY and encouraging — the visitor should feel they can do this.

- "reply": in character, ONLY in ${language}, very short and very simple: at most 8 words, using only the most basic, common words a total beginner might know (coffee, tea, water, yes, no, please, thank you, big, small, here, to go, numbers). Ask easy either/or questions the visitor can answer with one or two words (e.g. "Big or small?", "For here or to go?"). On the "__START__" message, greet them and ask what they'd like.
- "replyTranslation": a plain English translation of "reply".
- "tip": one short, warm English note (max 15 words) about the visitor's last message — praise something specific. If they wrote in English or made a mistake, kindly show the simple ${language} way to say it. Empty on "__START__".
- "suggestions": exactly 2 very short, simple ${language} phrases (1-4 words each) the visitor could say next that directly answer your question — e.g. the two options in an either/or question — each with its English "translation".${turnsLeft <= 1 ? `\n- This is the visitor's last message in the demo: wrap up warmly in a few simple words (e.g. "Here you go! Have a nice day!") instead of asking a new question, and make the 2 suggestions simple ways to say thanks or goodbye.` : ""}`;
}
app.post("/demo-chat", demoLimiter, async (req, res) => {
    try {
        const { language, history, message } = req.body || {};
        if (!LANGUAGES.includes(language)) return res.status(400).json({ error: "Unsupported language." });
        if (typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "Message is required." });
        if (message.length > DEMO_MAX_MESSAGE_LEN) return res.status(400).json({ error: "Keep it short for the demo." });
        const turns = (Array.isArray(history) ? history : [])
            .filter(t => t && typeof t.content === "string" && (t.role === "user" || t.role === "assistant"))
            .map(t => ({ role: t.role, content: t.content.slice(0, DEMO_MAX_MESSAGE_LEN) }));
        const learnerTurnsSoFar = turns.filter(t => t.role === "user" && t.content !== "__START__").length;
        if (learnerTurnsSoFar >= DEMO_MAX_TURNS) {
            return res.status(429).json({ error: "That's the demo — open the app to keep talking.", demoOver: true });
        }
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("YOUR_")) {
            return res.status(500).json({ error: "OPENAI_API_KEY is missing." });
        }
        const turnsLeft = message === "__START__" ? DEMO_MAX_TURNS : DEMO_MAX_TURNS - learnerTurnsSoFar;
        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildDemoPrompt(language, turnsLeft) },
                ...turns.slice(-8),
                { role: "user", content: message }
            ],
            text: { format: DEMO_JSON_SCHEMA }
        });
        const result = JSON.parse(response.output_text);
        res.json({ success: true, ...result, turnsLeft: message === "__START__" ? DEMO_MAX_TURNS : turnsLeft - 1 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "The demo couldn't reply just now." });
    }
});

// ==============================
// Conversation turn — real OpenAI call
// ==============================
// The client sends the full running history each turn (simple and stateless
// server-side — no session storage to manage) plus the new message. To
// start a fresh conversation, the client sends message: "__START__" with an
// empty history.
app.post("/converse", attachUserIfSignedIn, conversationLimiter, async (req, res) => {
    try {
        const { scenarioId, language, history, message, objectives, keyPhrases, vocabHistory, customTopic } = req.body;
        const nativeLanguage = normalizeNativeLanguage(req.body.nativeLanguage);

        // Free-tier daily caps: signed-in, non-premium learners get
        // dailyLimitFromRecord() conversations a day; guests get
        // GUEST_DAILY_CONVERSATIONS_PER_IP per network address, and hitting
        // that asks them to create a free account rather than to upgrade.
        // The billing record is fetched once here and reused below (rather
        // than a second Firestore read after the reply) so a signed-in
        // learner's turn costs at most one billing lookup.
        const billingRecord = req.uid ? await getBillingRecord(req.uid) : null;
        const isPremium = billingRecord ? billingRecord.premium : false;
        // The cap counts CONVERSATIONS, not messages: only the opening turn of
        // a conversation (the client's "__START__", sent with an empty
        // history) is checked and counted. Previously every message counted,
        // so "20 free conversations" ran out after roughly four real ones,
        // and a learner could be cut off mid-conversation.
        const isNewConversation = message === "__START__" || !Array.isArray(history) || history.length === 0;
        if (!req.uid && isNewConversation) {
            let guestUsed = 0;
            try { guestUsed = await guestUsedToday(req.ip); } catch (e) { guestUsed = 0; }
            if (guestUsed >= GUEST_DAILY_CONVERSATIONS_PER_IP) {
                return res.status(402).json({
                    error: "You've used today's free guest conversations. Create a free account to keep going.",
                    signupRequired: true
                });
            }
        }
        if (req.uid && !isPremium && isNewConversation) {
            const usedSoFar = usedTodayFromRecord(billingRecord);
            const limit = dailyLimitFromRecord(billingRecord);
            if (usedSoFar >= limit) {
                return res.status(402).json({
                    error: "You've used today's free conversations.",
                    upgradeRequired: true,
                    dailyLimit: limit
                });
            }
        }

        let scenario;
        if (scenarioId === FRIEND_SCENARIO_ID) {
            if (!LANGUAGES.includes(language)) {
                return res.status(400).json({ error: "Unsupported language." });
            }
            scenario = buildFriendScenario(language, req.body.friendMemory, req.body.friendHook);
        } else if (scenarioId === CUSTOM_SCENARIO_ID) {
            scenario = buildCustomScenario(customTopic);
            if (!scenario) {
                return res.status(400).json({ error: "Describe a topic to practice." });
            }
        } else {
            scenario = SCENARIOS[scenarioId];
            if (!scenario) {
                return res.status(400).json({ error: "Unknown scenario." });
            }
        }
        if (!LANGUAGES.includes(language)) {
            return res.status(400).json({ error: "Unsupported language." });
        }
        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "Message is required." });
        }
        // Every character sent here is paid for on the OpenAI bill, and the
        // body limit alone (1mb) would let one request carry a novel. A real
        // chat reply is a sentence or two, so cap it well above that.
        if (message.length > MAX_MESSAGE_LEN) {
            return res.status(400).json({ error: `That message is too long — keep it under ${MAX_MESSAGE_LEN} characters.` });
        }
        if (!Array.isArray(history)) {
            return res.status(400).json({ error: "History must be an array." });
        }

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("YOUR_")) {
            return res.status(500).json({
                error: "OPENAI_API_KEY is missing or still the placeholder value in server/.env."
            });
        }

        const historyInput = history
            .filter(turn => turn && typeof turn.content === "string" && (turn.role === "user" || turn.role === "assistant"))
            .slice(-20) // keep the request small; recent context is what matters for a natural reply
            .map(turn => ({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_LEN) }));

        // Echoed back by the client from /lesson-intro — sanitized here since
        // it's client-supplied. Capped to a sane length; the app only ever
        // sends 3, this just guards against a malformed request.
        const safeObjectives = Array.isArray(objectives)
            ? objectives.filter(o => typeof o === "string").slice(0, 10)
            : [];

        // Echoed back the same way as objectives (see above) — sanitized
        // since it's client-supplied. Capped to a sane length; the app only
        // ever sends the 5-8 phrases from that lesson's /lesson-intro call.
        const safeKeyPhrases = Array.isArray(keyPhrases)
            ? keyPhrases
                .filter(p => p && typeof p.phrase === "string" && typeof p.translation === "string")
                .slice(0, 10)
            : [];

        // The learner's cumulative vocabulary from every earlier completed
        // lesson in this language (see localStorage's keyPhrasesByLesson,
        // synced to Firestore alongside the rest of "progress"). Capped
        // generously — this bounds token usage for a learner deep into a
        // 30-lesson tier, not because that much vocabulary is a problem.
        const safeVocabHistory = Array.isArray(vocabHistory)
            ? vocabHistory
                .filter(p => p && typeof p.phrase === "string" && typeof p.translation === "string")
                .slice(0, 100)
            : [];

        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildSystemPrompt(language, scenario, safeObjectives, safeKeyPhrases, safeVocabHistory, nativeLanguage, {
                    // Both client-supplied booleans; only ever change how
                    // feedback is phrased, never limits or billing.
                    retrying: req.body.retrying === true && !isNewConversation,
                    replayRound: req.body.replayRound === true
                }) },
                ...historyInput,
                { role: "user", content: message }
            ],
            text: { format: scenario.friend ? FRIEND_CONVERSATION_JSON_SCHEMA : CONVERSATION_JSON_SCHEMA }
        });

        const result = JSON.parse(response.output_text);
        if (scenario.friend) {
            result.memoryNotes = (Array.isArray(result.memoryNotes) ? result.memoryNotes : [])
                .map(n => cleanPromptLine(n, FRIEND_NOTE_MAX_LEN)).filter(Boolean).slice(0, FRIEND_MEMORY_MAX);
            result.tomorrowHook = cleanPromptLine(result.tomorrowHook, FRIEND_NOTE_MAX_LEN);
        }

        // Only a successfully started conversation counts against the daily
        // cap — a failed call shouldn't cost the learner part of their allowance.
        if (!req.uid && isNewConversation) {
            try {
                await incrementGuestUsage(req.ip);
            } catch (countError) {
                console.error("Couldn't record guest conversation count:", countError.message);
            }
        }
        if (req.uid && !isPremium && isNewConversation) {
            try {
                await incrementDailyConvos(req.uid);
            } catch (countError) {
                // Don't fail the learner's reply over a bookkeeping write.
                console.error("Couldn't record daily conversation count:", countError.message);
            }
        }

        res.json({ success: true, ...result });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Couldn't get a reply: " + (error.message || "unknown error")
        });
    }
});

// ==============================
// Lesson intro — real OpenAI call
// ==============================
// Called once, right when the learner taps into a lesson (before the chat
// starts): returns the goal checklist and a handful of useful phrases so the
// intro screen has something to show. See buildLessonIntroPrompt above for
// why this is generated per-request rather than stored per-scenario.
app.post("/lesson-intro", introLimiter, async (req, res) => {
    try {
        const { scenarioId, language } = req.body;
        const nativeLanguage = normalizeNativeLanguage(req.body.nativeLanguage);

        const scenario = SCENARIOS[scenarioId];
        if (!scenario) {
            return res.status(400).json({ error: "Unknown scenario." });
        }
        if (!LANGUAGES.includes(language)) {
            return res.status(400).json({ error: "Unsupported language." });
        }

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("YOUR_")) {
            return res.status(500).json({
                error: "OPENAI_API_KEY is missing or still the placeholder value in server/.env."
            });
        }

        const cacheKey = scenarioCacheKey(scenarioId, language, nativeLanguage);
        const cached = lessonIntroCache.get(cacheKey);
        if (cached) {
            return res.json({ success: true, ...cached });
        }

        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildLessonIntroPrompt(language, scenario, nativeLanguage) },
                { role: "user", content: "Generate the lesson intro." }
            ],
            text: { format: LESSON_INTRO_JSON_SCHEMA }
        });

        const result = JSON.parse(response.output_text);
        lessonIntroCache.set(cacheKey, result);
        res.json({ success: true, ...result });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Couldn't prepare this lesson: " + (error.message || "unknown error")
        });
    }
});

// ==============================
// Lesson practice round — real OpenAI call
// ==============================
// Called once, right when the learner taps into a lesson (alongside
// /lesson-intro): returns 5 short, mixed-format practice exercises the
// learner works through before the open-ended roleplay chat starts. See
// buildLessonPracticePrompt above for why this is generated per-request
// rather than stored per-scenario.
app.post("/lesson-practice", practiceLimiter, async (req, res) => {
    try {
        const { scenarioId, language } = req.body;
        const nativeLanguage = normalizeNativeLanguage(req.body.nativeLanguage);

        const scenario = SCENARIOS[scenarioId];
        if (!scenario) {
            return res.status(400).json({ error: "Unknown scenario." });
        }
        if (!LANGUAGES.includes(language)) {
            return res.status(400).json({ error: "Unsupported language." });
        }

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("YOUR_")) {
            return res.status(500).json({
                error: "OPENAI_API_KEY is missing or still the placeholder value in server/.env."
            });
        }

        const cacheKey = scenarioCacheKey(scenarioId, language, nativeLanguage);
        const cached = lessonPracticeCache.get(cacheKey);
        if (cached) {
            return res.json({ success: true, exercises: cached.exercises });
        }

        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildLessonPracticePrompt(language, scenario, nativeLanguage) },
                { role: "user", content: "Generate the practice round." }
            ],
            text: { format: PRACTICE_JSON_SCHEMA }
        });

        const result = JSON.parse(response.output_text);
        lessonPracticeCache.set(cacheKey, result);
        res.json({ success: true, exercises: result.exercises });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Couldn't prepare practice exercises: " + (error.message || "unknown error")
        });
    }
});

// ==============================
// Phrase lookup — real OpenAI call
// ==============================
// A lightweight, one-shot companion to /converse: the learner can look up
// any word, phrase, or saying while inside a lesson, separate from the
// roleplay itself. No conversation history needed — each lookup stands
// alone. scenarioId (optional) is just used to avoid suggesting the lesson
// the learner is already in.
app.post("/lookup", lookupLimiter, async (req, res) => {
    try {
        const { phrase, language, scenarioId } = req.body;
        const nativeLanguage = normalizeNativeLanguage(req.body.nativeLanguage);

        if (!LANGUAGES.includes(language)) {
            return res.status(400).json({ error: "Unsupported language." });
        }
        if (typeof phrase !== "string" || !phrase.trim()) {
            return res.status(400).json({ error: "Enter a word or phrase to look up." });
        }
        if (phrase.trim().length > 200) {
            return res.status(400).json({ error: "That's too long to look up — try a shorter phrase." });
        }

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith("YOUR_")) {
            return res.status(500).json({
                error: "OPENAI_API_KEY is missing or still the placeholder value in server/.env."
            });
        }

        const trimmedPhrase = phrase.trim();

        // suggestedLesson depends on scenarioId (which lesson to exclude), so
        // it's computed fresh below either way — only the AI-generated part
        // of the result (translation, notes, etc.) is what's cached, since
        // that part is the same for this phrase+language no matter who's
        // asking or which lesson they're in.
        let result = lookupCache.get(lookupCacheKey(trimmedPhrase, language, nativeLanguage));
        if (!result) {
            const response = await getClient().responses.create({
                model: MODEL,
                input: [
                    { role: "system", content: buildLookupPrompt(language, nativeLanguage) },
                    { role: "user", content: trimmedPhrase }
                ],
                text: { format: LOOKUP_JSON_SCHEMA }
            });
            result = JSON.parse(response.output_text);
            lookupCache.set(lookupCacheKey(trimmedPhrase, language, nativeLanguage), result);
        }

        const suggestedLesson = findRelatedLesson(
            `${trimmedPhrase} ${result.translation}`,
            typeof scenarioId === "string" ? scenarioId : null
        );

        res.json({ success: true, phrase: trimmedPhrase, ...result, suggestedLesson });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Couldn't look that up: " + (error.message || "unknown error")
        });
    }
});

// ==============================
// Billing — Stripe Checkout + Customer Portal + webhook
// ==============================

// GET /billing/status — tells the frontend whether this signed-in learner is
// premium, and if not, how many of today's free conversations are left.
// Guests (no valid token) just get signedIn: false; the frontend treats that
// the same as it always has, with no cap shown at all.
app.get("/billing/status", attachUserIfSignedIn, async (req, res) => {
    if (!req.uid) {
        return res.json({ signedIn: false, premium: false });
    }
    try {
        const record = await getBillingRecord(req.uid);
        const isPremium = record.premium;
        const used = usedTodayFromRecord(record);
        const limit = dailyLimitFromRecord(record);
        res.json({
            signedIn: true,
            premium: isPremium,
            dailyLimit: limit,
            dailyUsed: isPremium ? 0 : used,
            dailyRemaining: isPremium ? null : Math.max(0, limit - used),
            referralCode: req.uid,
            referralBonus: record.referralBonus || 0,
            hasClaimedReferral: !!record.referredBy
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Couldn't load your plan right now." });
    }
});

// POST /referral/claim — a new (or at least first-time-claiming) signed-in
// learner redeems a friend's referral code (their friend's uid). Bumps both
// sides' daily free-conversation limit by REFERRAL_BONUS_CONVERSATIONS, once
// per learner — claiming again, or claiming your own code, is rejected.
// Doesn't verify the code belongs to a real Firebase user — the only
// downside of a made-up code is a harmless, unclaimed bonus sitting on a
// uid nobody owns, not worth a Firebase Admin lookup to prevent.
app.post("/referral/claim", attachUserIfSignedIn, async (req, res) => {
    if (!req.uid) {
        return res.status(401).json({ error: "Sign in first to claim a referral." });
    }
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!code) {
        return res.status(400).json({ error: "Missing referral code." });
    }
    // The code is a Firebase uid and is used as a Firestore document id —
    // anything with a "/" or other odd characters would make Firestore throw.
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(code)) {
        return res.status(400).json({ error: "That referral code isn't valid." });
    }
    if (code === req.uid) {
        return res.status(400).json({ error: "You can't refer yourself." });
    }
    try {
        const outcome = await claimReferral(req.uid, code);
        if (outcome === "already-claimed") {
            return res.status(409).json({ error: "You've already claimed a referral bonus." });
        }
        const record = await getBillingRecord(req.uid);
        res.json({
            success: true,
            bonusConversations: REFERRAL_BONUS_CONVERSATIONS,
            newDailyLimit: dailyLimitFromRecord(record)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Couldn't claim that referral right now." });
    }
});

// POST /billing/create-checkout-session — starts a subscription purchase for
// the signed-in learner and hands back the Stripe-hosted page to redirect to.
app.post("/billing/create-checkout-session", attachUserIfSignedIn, async (req, res) => {
    if (!req.uid) {
        return res.status(401).json({ error: "Sign in first to upgrade." });
    }
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
        return res.status(500).json({ error: "Billing isn't configured yet." });
    }
    try {
        let { stripeCustomerId: customerId } = await getBillingRecord(req.uid);
        if (!customerId) {
            const email = typeof req.body?.email === "string" ? req.body.email : undefined;
            const customer = await getStripe().customers.create({
                email,
                // Belt-and-suspenders alongside client_reference_id below — if
                // this customer's billing doc write below is somehow delayed or
                // lost, this metadata is a durable fallback for the webhook to
                // recover the uid from (see uidForStripeCustomer above).
                metadata: { firebaseUid: req.uid }
            });
            customerId = customer.id;
            await setBillingRecord(req.uid, { stripeCustomerId: customerId });
        }
        const origin = req.get("origin") || `${req.protocol}://${req.get("host")}`;
        const session = await getStripe().checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            client_reference_id: req.uid,
            line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
            success_url: `${origin}/app.html?upgraded=1`,
            cancel_url: `${origin}/app.html`,
            // Managed Payments (Stripe's newer opt-out-by-default feature) requires
            // every product to have a tax code assigned before Checkout will let it
            // through. We're not using Stripe Tax here, so opt this session out
            // rather than forcing a tax_code onto the product.
            managed_payments: { enabled: false }
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Couldn't start checkout: " + (error.message || "unknown error") });
    }
});

// POST /billing/create-portal-session — lets an existing subscriber manage
// or cancel their subscription on Stripe's own hosted page.
app.post("/billing/create-portal-session", attachUserIfSignedIn, async (req, res) => {
    if (!req.uid) {
        return res.status(401).json({ error: "Sign in first." });
    }
    try {
        const { stripeCustomerId: customerId } = await getBillingRecord(req.uid);
        if (!customerId) {
            return res.status(404).json({ error: "No billing account found for this user yet." });
        }
        const origin = req.get("origin") || `${req.protocol}://${req.get("host")}`;
        const session = await getStripe().billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}/app.html`
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Couldn't open billing portal: " + (error.message || "unknown error") });
    }
});

// POST /webhooks/stripe — Stripe calls this directly (not the browser) every
// time a subscription starts, renews, or ends, so premium status here stays
// correct even if a learner closes the tab mid-checkout or cancels from
// Stripe's own portal instead of the app. Protected by verifying Stripe's
// signature (not the admin-secret pattern used above) — that's the standard,
// Stripe-documented way to confirm a webhook request actually came from
// Stripe and wasn't forged.
app.post("/webhooks/stripe", async (req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(404).json({ error: "Not found." });
    }
    let event;
    try {
        event = getStripe().webhooks.constructEvent(
            req.rawBody,
            req.get("stripe-signature"),
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        console.error("Stripe webhook signature check failed:", error.message);
        return res.status(400).json({ error: "Invalid signature." });
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                if (session.client_reference_id && session.customer) {
                    await setBillingRecord(session.client_reference_id, { stripeCustomerId: session.customer });
                }
                break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const sub = event.data.object;
                const uid = await uidForStripeCustomer(sub.customer);
                if (uid) {
                    await setBillingRecord(uid, {
                        stripeCustomerId: sub.customer,
                        premium: sub.status === "active" || sub.status === "trialing"
                    });
                }
                break;
            }
            case "customer.subscription.deleted": {
                const sub = event.data.object;
                const uid = await uidForStripeCustomer(sub.customer);
                if (uid) await setBillingRecord(uid, { premium: false });
                break;
            }
        }
        res.json({ received: true });
    } catch (error) {
        console.error("Stripe webhook handling failed:", error);
        res.status(500).json({ error: "Webhook handling failed." });
    }
});

// Daily practice reminder emails — opt-in, off until configured. See
// reminders.js for how it works and which environment variables turn it on.
require("./reminders")({ app, getDb: () => db, getAuth, SCENARIOS });

// Render (and most hosts) assign their own port via the PORT environment
// variable — the app has to listen on whatever they hand it, not a
// hardcoded number, or the deploy fails to come up. Locally, nothing sets
// PORT, so this still falls back to 3000 exactly as before.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Echoly server running at http://localhost:${PORT}`);
});
