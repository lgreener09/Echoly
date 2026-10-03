// ==============================
// Daily practice reminder emails
// ==============================
// Opt-in only: a signed-in learner turns reminders on in the app, which
// saves `reminders: { enabled, tz, updatedAt }` into their own users/{uid}
// document (alongside progress/streak — see localDataSnapshot in app.html).
//
// Something outside Render calls POST /cron/send-reminders once an hour
// (see .github/workflows/daily-reminders.yml). Each run, for every opted-in
// learner, an email goes out when ALL of these are true:
//   - it's between REMINDER_HOUR and REMINDER_HOUR+3 in the learner's own
//     time zone (so a late or skipped hourly run still lands that evening)
//   - they haven't finished a conversation yet today
//   - they haven't already been emailed today
//   - they're still "warm": emailed daily for the first 3 days of being
//     inactive, then on days 5, 7, 10, 14, 21 and 30, then never again
//     until they come back. A lapsed learner shouldn't get daily mail forever.
//
// Server-side bookkeeping (last sent date, unsubscribes) lives in its own
// `reminderLog` collection, written only by this server — the client
// overwrites users/{uid} wholesale on every sync, so anything stored there
// by the server would be wiped.
//
// Turned on by four environment variables on Render — until all are set,
// the endpoint just reports what's missing and sends nothing:
//   RESEND_API_KEY   from resend.com (free tier: 3,000 emails/month)
//   EMAIL_FROM       e.g. "Echoly <hello@yourdomain.com>" — must be on a
//                    domain you've verified in Resend
//   CRON_SECRET      any long random string; the same value goes in the
//                    GitHub repo's Actions secrets (see the workflow file)
//   FIREBASE_SERVICE_ACCOUNT_JSON  (already set up for billing)
// Optional:
//   APP_URL                 defaults to https://echoly-enjr.onrender.com
//   REMINDER_HOUR           local hour to start sending, default 18 (6pm)
//   EMAIL_MAILING_ADDRESS   your postal mailing address, shown in the
//                           email footer (Canada's anti-spam law, CASL,
//                           requires one in this kind of email)

const crypto = require("crypto");

const SEND_ON_INACTIVE_DAYS = new Set([1, 2, 3, 5, 7, 10, 14, 21, 30]);
const DEFAULT_TZ = "America/Toronto";

// Goal-based "quick situation" suggestions — mirrors GOALS in app.html.
const GOAL_TOPICS = {
    travel: ["🍽️ Order dinner", "🏨 Check into a hotel", "🚆 Buy a train ticket", "🗺️ Ask for directions"],
    family: ["💐 Meet the parents", "🍲 Family dinner", "📞 Birthday call", "📸 Share your news"],
    work: ["🤝 Meet a coworker", "☕ Small talk", "📞 Call a client", "🎯 Job interview"],
    moving: ["🔑 View an apartment", "🏦 Open a bank account", "🩺 Book a doctor", "🏡 Meet a neighbour"],
    fun: ["☕ Order a coffee", "🎬 Talk movies", "🛍️ Market shopping", "🌤️ Weekend plans"]
};

function appUrl() {
    return (process.env.APP_URL || "https://echoly-enjr.onrender.com").replace(/\/+$/, "");
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function isValidTimeZone(tz) {
    if (typeof tz !== "string" || !tz) return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
}

// { date: "YYYY-MM-DD", hour: 0-23 } for `now` in time zone `tz` — the
// same YYYY-MM-DD format the app uses for streak.lastActiveDate.
function localDateAndHour(now, tz) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
    }).formatToParts(now);
    const get = type => (parts.find(p => p.type === type) || {}).value;
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: parseInt(get("hour"), 10) };
}

function daysBetween(fromDateStr, toDateStr) {
    const a = Date.UTC(...fromDateStr.split("-").map((n, i) => i === 1 ? Number(n) - 1 : Number(n)));
    const b = Date.UTC(...toDateStr.split("-").map((n, i) => i === 1 ? Number(n) - 1 : Number(n)));
    return Math.round((b - a) / 86400000);
}

function unsubscribeToken(uid) {
    return crypto.createHmac("sha256", process.env.CRON_SECRET || "").update(`unsub:${uid}`).digest("hex").slice(0, 32);
}
function unsubscribeUrl(uid) {
    return `${appUrl()}/unsubscribe?u=${encodeURIComponent(uid)}&t=${unsubscribeToken(uid)}`;
}
function tokenMatches(uid, token) {
    const expected = unsubscribeToken(uid);
    return typeof token === "string" && token.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// Pure decision function — easy to reason about and test on its own.
// Returns { send: boolean, reason, ...details }.
function decideReminder(userDoc, logDoc, now, reminderHour) {
    const reminders = userDoc && userDoc.reminders;
    if (!reminders || reminders.enabled !== true) return { send: false, reason: "not opted in" };

    const unsubscribedAt = logDoc && logDoc.unsubscribedAt ? Date.parse(logDoc.unsubscribedAt) : 0;
    const optedInAt = reminders.updatedAt ? Date.parse(reminders.updatedAt) : 0;
    if (unsubscribedAt && unsubscribedAt >= optedInAt) return { send: false, reason: "unsubscribed" };

    const tz = isValidTimeZone(reminders.tz) ? reminders.tz : DEFAULT_TZ;
    const { date: today, hour } = localDateAndHour(now, tz);
    if (hour < reminderHour || hour >= reminderHour + 3) return { send: false, reason: `outside send window (local hour ${hour})` };
    if (logDoc && logDoc.lastSentDate === today) return { send: false, reason: "already sent today" };

    const streak = userDoc.streak || {};
    const lastActive = typeof streak.lastActiveDate === "string" ? streak.lastActiveDate : null;
    if (lastActive === today) return { send: false, reason: "already practiced today" };

    // Days since they last finished a conversation — or, if they never
    // have, since they turned reminders on.
    let inactiveDays;
    if (lastActive) {
        inactiveDays = daysBetween(lastActive, today);
    } else if (optedInAt) {
        inactiveDays = Math.max(1, daysBetween(localDateAndHour(new Date(optedInAt), tz).date, today));
    } else {
        inactiveDays = 1;
    }
    if (!SEND_ON_INACTIVE_DAYS.has(inactiveDays)) return { send: false, reason: `inactive ${inactiveDays} days (not a send day)` };

    const streakAlive = inactiveDays === 1 && (streak.currentStreak || 0) > 0;
    return { send: true, reason: "ok", today, tz, inactiveDays, streakAlive, currentStreak: streak.currentStreak || 0 };
}

// Picks the learner's language, their next lesson in it, and a few
// goal-based situations to suggest.
function buildPlan(userDoc, SCENARIOS) {
    const progress = (userDoc && userDoc.progress) || {};
    const onboarding = (userDoc && userDoc.onboarding) || {};
    const language = onboarding.language || Object.keys(progress)[0] || "Spanish";
    const completed = (progress[language] && Array.isArray(progress[language].completed)) ? progress[language].completed : [];
    const nextId = Object.keys(SCENARIOS).find(id => !completed.includes(id));
    const next = nextId ? { id: nextId, ...SCENARIOS[nextId] } : null;
    const topics = GOAL_TOPICS[onboarding.goal] || GOAL_TOPICS.fun;
    return { language, next, topics, completedCount: completed.length };
}

function buildEmail({ plan, decision, uid }) {
    const { language, next, topics } = plan;
    const link = `${appUrl()}/app.html?utm_source=reminder&utm_medium=email`;
    const unsub = unsubscribeUrl(uid);

    let subject;
    let headline;
    if (decision.streakAlive) {
        subject = `🔥 Keep your ${decision.currentStreak}-day streak alive`;
        headline = `Your ${decision.currentStreak}-day streak ends at midnight.`;
    } else if (decision.inactiveDays <= 3) {
        subject = next ? `Today's ${language} conversation: ${next.title}` : `Your ${language} conversation for today`;
        headline = `Got two minutes? Your next ${language} conversation is ready.`;
    } else {
        subject = `Your ${language} is waiting for you`;
        headline = `It's been a little while. Jump back in with one short ${language} conversation.`;
    }

    const nextHtml = next
        ? `<tr><td style="padding:18px 20px;background:#322234;border-radius:14px;color:#f7f1ec;">
             <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f0836f;font-weight:700;margin-bottom:6px;">Up next</div>
             <div style="font-size:20px;font-weight:800;margin-bottom:4px;">${escapeHtml(next.icon)} ${escapeHtml(next.title)}</div>
             <div style="font-size:14px;color:#d9cfd6;">${escapeHtml(next.blurb)}</div>
           </td></tr>`
        : "";
    const topicsHtml = topics.map(t => `<a href="${link}" style="display:inline-block;margin:0 6px 8px 0;padding:6px 12px;border:1px solid #eae1e6;border-radius:999px;font-size:13px;color:#221825;text-decoration:none;">${escapeHtml(t)}</a>`).join("");
    const mailing = process.env.EMAIL_MAILING_ADDRESS
        ? `<br>${escapeHtml(process.env.EMAIL_MAILING_ADDRESS)}`
        : "";

    const html = `<!doctype html><html><body style="margin:0;background:#fbf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#221825;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf7f2;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td style="padding-bottom:14px;"><img src="${appUrl()}/mascot/mascot-wave-email.png" width="84" alt="Echoly" style="display:block;width:84px;height:auto;border:0;"></td></tr>
  <tr><td style="font-size:22px;font-weight:800;line-height:1.25;padding-bottom:16px;">${escapeHtml(headline)}</td></tr>
  ${nextHtml}
  <tr><td style="padding:22px 0 8px;">
    <a href="${link}" style="display:inline-block;background:#e85d4c;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:11px;">Start talking →</a>
  </td></tr>
  <tr><td style="padding:16px 0 6px;font-size:14px;color:#6b5f6e;">Or practice a real situation:</td></tr>
  <tr><td>${topicsHtml}</td></tr>
  <tr><td style="padding-top:28px;font-size:12px;color:#8a7f8c;line-height:1.5;border-top:1px solid #eae1e6;">
    You're getting this because you turned on daily practice reminders in Echoly.
    <a href="${unsub}" style="color:#8a7f8c;">Unsubscribe</a> or switch them off any time in the app.<br>
    Echoly · <a href="mailto:echolylanguage@yahoo.com" style="color:#8a7f8c;">echolylanguage@yahoo.com</a>${mailing}
  </td></tr>
</table></td></tr></table></body></html>`;

    const text = [
        headline,
        next ? `\nUp next: ${next.title} — ${next.blurb}` : "",
        `\nStart talking: ${link}`,
        `\nOr practice a real situation: ${topics.join(", ")}`,
        `\n—\nYou're getting this because you turned on daily practice reminders in Echoly.`,
        `Unsubscribe: ${unsub}`,
        `Echoly · echolylanguage@yahoo.com${process.env.EMAIL_MAILING_ADDRESS ? `\n${process.env.EMAIL_MAILING_ADDRESS}` : ""}`
    ].join("\n");

    return { subject, html, text, unsub };
}

async function sendViaResend({ to, subject, html, text, unsub }) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [to],
            subject,
            html,
            text,
            headers: {
                "List-Unsubscribe": `<${unsub}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
            }
        })
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = function registerReminders({ app, getDb, getAuth, SCENARIOS }) {
    function missingConfig() {
        const missing = [];
        if (!getDb()) missing.push("FIREBASE_SERVICE_ACCOUNT_JSON");
        if (!process.env.CRON_SECRET) missing.push("CRON_SECRET");
        if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
        if (!process.env.EMAIL_FROM) missing.push("EMAIL_FROM");
        return missing;
    }

    function cronAuthorized(req) {
        const secret = process.env.CRON_SECRET;
        if (!secret) return false;
        const header = req.get("Authorization") || "";
        const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        return given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    }

    let running = false;

    // POST /cron/send-reminders  (Authorization: Bearer <CRON_SECRET>)
    // ?dryRun=1 reports what would be sent without sending anything.
    app.post("/cron/send-reminders", async (req, res) => {
        if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized." });
        const missing = missingConfig();
        if (missing.length) return res.status(503).json({ error: "Reminder emails aren't configured yet.", missing });
        if (running) return res.status(409).json({ error: "A reminder run is already in progress." });

        const dryRun = req.query.dryRun === "1";
        const reminderHour = Number.isInteger(parseInt(process.env.REMINDER_HOUR, 10)) ? parseInt(process.env.REMINDER_HOUR, 10) : 18;
        const now = new Date();
        const summary = { checked: 0, sent: 0, skipped: 0, failed: 0, dryRun, details: [] };
        running = true;
        try {
            const db = getDb();
            const snap = await db.collection("users").where("reminders.enabled", "==", true).get();
            for (const doc of snap.docs) {
                summary.checked++;
                const uid = doc.id;
                const userDoc = doc.data();
                const logRef = db.collection("reminderLog").doc(uid);
                const logSnap = await logRef.get();
                const logDoc = logSnap.exists ? logSnap.data() : null;

                const decision = decideReminder(userDoc, logDoc, now, reminderHour);
                if (!decision.send) {
                    summary.skipped++;
                    if (dryRun) summary.details.push({ uid, send: false, reason: decision.reason });
                    continue;
                }

                let email = null;
                try { email = (await getAuth().getUser(uid)).email || null; } catch (e) { email = null; }
                if (!email) {
                    summary.skipped++;
                    if (dryRun) summary.details.push({ uid, send: false, reason: "no email on account" });
                    continue;
                }

                const plan = buildPlan(userDoc, SCENARIOS);
                const message = buildEmail({ plan, decision, uid });
                if (dryRun) {
                    summary.details.push({ uid, send: true, subject: message.subject, inactiveDays: decision.inactiveDays, language: plan.language });
                    continue;
                }
                try {
                    await sendViaResend({ to: email, ...message });
                    await logRef.set({ lastSentDate: decision.today, lastSentAt: now.toISOString() }, { merge: true });
                    summary.sent++;
                } catch (e) {
                    summary.failed++;
                    console.error(`Reminder email to ${uid} failed:`, e.message);
                }
                await sleep(600); // Resend's free tier allows 2 requests/second
            }
            res.json(summary);
        } catch (e) {
            console.error("Reminder run failed:", e);
            res.status(500).json({ error: "Reminder run failed: " + e.message, ...summary });
        } finally {
            running = false;
        }
    });

    // One-click unsubscribe — linked from every email, and also what email
    // providers call (POST) for their built-in "Unsubscribe" button.
    async function handleUnsubscribe(req, res) {
        const uid = String(req.query.u || "");
        const token = String(req.query.t || "");
        const db = getDb();
        if (!uid || !db || !process.env.CRON_SECRET || !tokenMatches(uid, token)) {
            return res.status(400).send(unsubPage("That unsubscribe link isn't valid.", "If you keep getting emails you don't want, reply to one of them or email echolylanguage@yahoo.com and we'll stop them."));
        }
        try {
            await db.collection("reminderLog").doc(uid).set({ unsubscribedAt: new Date().toISOString() }, { merge: true });
        } catch (e) {
            return res.status(500).send(unsubPage("Something went wrong.", "Please try the link again in a minute, or email echolylanguage@yahoo.com."));
        }
        res.send(unsubPage("You're unsubscribed.", "You won't get any more practice reminders. You can turn them back on any time from the app's sidebar."));
    }
    app.get("/unsubscribe", handleUnsubscribe);
    app.post("/unsubscribe", handleUnsubscribe);

    function unsubPage(title, body) {
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Echoly — ${escapeHtml(title)}</title></head>
<body style="margin:0;background:#fbf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#221825;">
<div style="max-width:460px;margin:80px auto;padding:0 20px;text-align:center;">
<div style="font-size:22px;font-weight:800;margin-bottom:24px;"><span style="color:#e85d4c;">●</span> Echoly</div>
<h1 style="font-size:26px;margin:0 0 10px;">${escapeHtml(title)}</h1>
<p style="color:#6b5f6e;font-size:15px;line-height:1.5;">${escapeHtml(body)}</p>
<a href="${appUrl()}/app.html" style="display:inline-block;margin-top:14px;color:#e85d4c;font-weight:700;">Back to Echoly</a>
</div></body></html>`;
    }
};

// Exposed for testing.
module.exports.decideReminder = decideReminder;
module.exports.buildPlan = buildPlan;
module.exports.buildEmail = buildEmail;
