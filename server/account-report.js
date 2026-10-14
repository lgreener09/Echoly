// Echoly account report — run locally, never deployed or exposed as a route.
//
// Lists every Firebase Auth account, joins each one with its users/{uid}
// progress doc and server-only billing/{uid} doc, prints a retention summary,
// and writes the full per-account list to a CSV next to this file.
//
// Credentials (either one):
//   1. FIREBASE_SERVICE_ACCOUNT_JSON in server/.env (same value Render uses), or
//   2. a service-account key file passed as the first argument:
//        node account-report.js serviceAccount.json
//
// The CSV contains learners' emails — it's gitignored; don't commit or share it.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function loadCredentials() {
    const fileArg = process.argv[2];
    if (fileArg) {
        const full = path.resolve(fileArg);
        if (!fs.existsSync(full)) {
            console.error(`Service account file not found: ${full}`);
            process.exit(1);
        }
        return JSON.parse(fs.readFileSync(full, "utf8"));
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }
    console.error(
        "No Firebase credentials found.\n" +
        "Either add FIREBASE_SERVICE_ACCOUNT_JSON to server/.env (copy it from Render → Environment),\n" +
        "or download a key (Firebase console → Project settings → Service accounts → Generate new private key)\n" +
        "and run:  node account-report.js serviceAccount.json"
    );
    process.exit(1);
}

const DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function isoDay(d) {
    return d ? d.toISOString().slice(0, 10) : "";
}

// Monday of the week a date falls in, as YYYY-MM-DD.
function weekOf(d) {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - dow);
    return isoDay(copy);
}

function csvCell(value) {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function pct(n, total) {
    return total ? `${Math.round((n / total) * 100)}%` : "0%";
}

async function listAllUsers(auth) {
    const users = [];
    let pageToken;
    do {
        const page = await auth.listUsers(1000, pageToken);
        users.push(...page.users);
        pageToken = page.pageToken;
    } while (pageToken);
    return users;
}

// Firestore getAll() in chunks so a few thousand accounts don't hit request limits.
async function fetchDocs(db, collection, uids) {
    const out = new Map();
    for (let i = 0; i < uids.length; i += 300) {
        const refs = uids.slice(i, i + 300).map(uid => db.collection(collection).doc(uid));
        if (!refs.length) continue;
        const snaps = await db.getAll(...refs);
        snaps.forEach(snap => out.set(snap.id, snap.exists ? snap.data() : null));
    }
    return out;
}

async function main() {
    initializeApp({ credential: cert(loadCredentials()) });
    const auth = getAuth();
    const db = getFirestore();

    console.log("Fetching accounts...");
    const users = await listAllUsers(auth);
    const uids = users.map(u => u.uid);
    const [progressDocs, billingDocs] = await Promise.all([
        fetchDocs(db, "users", uids),
        fetchDocs(db, "billing", uids)
    ]);

    const now = Date.now();
    const rows = users.map(u => {
        const data = progressDocs.get(u.uid) || {};
        const billing = billingDocs.get(u.uid) || {};
        const created = toDate(u.metadata.creationTime);
        // lastRefreshTime updates whenever a signed-in session is used;
        // lastSignInTime only when they actually type a password / pick Google.
        const lastSeenAuth = toDate(u.metadata.lastRefreshTime) || toDate(u.metadata.lastSignInTime);
        const streak = data.streak || {};
        const lastPractice = toDate(streak.lastActiveDate);
        const convoCounts = data.convoCounts && typeof data.convoCounts === "object" ? data.convoCounts : {};
        const recentConvos = Object.values(convoCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
        const practiceDays = Object.keys(convoCounts).length;
        const hasProgress = data.progress && Object.keys(data.progress).length > 0;
        const lastSeen = [lastSeenAuth, lastPractice].filter(Boolean).sort((a, b) => b - a)[0] || null;
        const onboarding = data.onboarding || {};

        return {
            uid: u.uid,
            email: u.email || "",
            provider: (u.providerData[0] && u.providerData[0].providerId) || "unknown",
            emailVerified: u.emailVerified,
            created,
            lastSeen,
            lastPractice,
            language: onboarding.language || "",
            goal: onboarding.goal || "",
            hasUserDoc: progressDocs.get(u.uid) != null,
            hasProgress: !!hasProgress,
            recentConvos,
            practiceDays,
            currentStreak: Number(streak.currentStreak) || 0,
            longestStreak: Number(streak.longestStreak) || 0,
            remindersOn: !!(data.reminders && data.reminders.enabled),
            premium: billing.premium === true,
            referredBy: billing.referredBy || ""
        };
    });

    const total = rows.length;
    if (!total) {
        console.log("No accounts found in this Firebase project.");
        return;
    }

    const count = fn => rows.filter(fn).length;
    const practiced = r => r.recentConvos > 0 || r.hasProgress || r.longestStreak > 0;
    const cameBack = r => r.created && r.lastSeen && (r.lastSeen - r.created) > DAY;
    const activeWithin = days => r => r.lastSeen && (now - r.lastSeen) <= days * DAY;

    console.log("\n=== Echoly accounts ===");
    console.log(`Total accounts:                ${total}`);
    console.log(`Never practiced at all:        ${count(r => !practiced(r))} (${pct(count(r => !practiced(r)), total)})`);
    console.log(`Came back after day 1:         ${count(cameBack)} (${pct(count(cameBack), total)})`);
    console.log(`Practiced on 2+ days:          ${count(r => r.practiceDays >= 2 || r.longestStreak >= 2)} (${pct(count(r => r.practiceDays >= 2 || r.longestStreak >= 2), total)})`);
    console.log(`Active in last 7 days:         ${count(activeWithin(7))} (${pct(count(activeWithin(7)), total)})`);
    console.log(`Active in last 30 days:        ${count(activeWithin(30))} (${pct(count(activeWithin(30)), total)})`);
    console.log(`Current streak > 0:            ${count(r => r.currentStreak > 0)}`);
    console.log(`Reminder emails on:            ${count(r => r.remindersOn)}`);
    console.log(`Premium (incl. trials):        ${count(r => r.premium)}`);
    console.log(`Came via referral:             ${count(r => r.referredBy)}`);

    const tally = key => {
        const m = {};
        rows.forEach(r => { const k = r[key] || "(not set)"; m[k] = (m[k] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };

    console.log("\nSign-in method:");
    tally("provider").forEach(([k, n]) => console.log(`  ${k.padEnd(20)} ${n}`));

    console.log("\nLanguage picked:");
    tally("language").forEach(([k, n]) => console.log(`  ${k.padEnd(20)} ${n}`));

    console.log("\nGoal picked:");
    tally("goal").forEach(([k, n]) => console.log(`  ${k.padEnd(20)} ${n}`));

    console.log("\nSignups by week (week starting) — signups / came back / still active last 7d:");
    const weeks = {};
    rows.filter(r => r.created).forEach(r => {
        const w = weekOf(r.created);
        weeks[w] = weeks[w] || { signups: 0, back: 0, active: 0 };
        weeks[w].signups++;
        if (cameBack(r)) weeks[w].back++;
        if (activeWithin(7)(r)) weeks[w].active++;
    });
    Object.keys(weeks).sort().forEach(w => {
        const { signups, back, active } = weeks[w];
        console.log(`  ${w}   ${String(signups).padStart(4)} / ${String(back).padStart(4)} (${pct(back, signups).padStart(4)}) / ${String(active).padStart(4)}`);
    });

    const header = [
        "email", "uid", "provider", "email_verified", "created", "last_seen", "last_practice",
        "language", "goal", "practiced", "recent_convos", "practice_days",
        "current_streak", "longest_streak", "reminders_on", "premium", "referred_by"
    ];
    const lines = [header.join(",")];
    rows
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .forEach(r => {
            lines.push([
                r.email, r.uid, r.provider, r.emailVerified, isoDay(r.created), isoDay(r.lastSeen), isoDay(r.lastPractice),
                r.language, r.goal, practiced(r), r.recentConvos, r.practiceDays,
                r.currentStreak, r.longestStreak, r.remindersOn, r.premium, r.referredBy
            ].map(csvCell).join(","));
        });

    const outFile = path.join(__dirname, `accounts-${isoDay(new Date())}.csv`);
    fs.writeFileSync(outFile, lines.join("\n"), "utf8");
    console.log(`\nFull list written to ${outFile}`);
    console.log("(recent_convos only covers the app's convo-count history window, not all time.)");
}

main().catch(err => {
    console.error("Report failed:", err.message);
    process.exit(1);
});
