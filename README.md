# Echoly

An AI conversation-practice app: pick a language and a real-life scenario (ordering coffee, asking directions, a doctor's visit, and more), and have an actual back-and-forth conversation with an AI playing that role — with a quick tip whenever something you say isn't quite how a native speaker would phrase it. Not vocab drills — real conversation practice.

## What's included

- **The app** (`index.html` + `server/server.js`) — 6 scenarios, 6 languages, AI roleplay with translation toggle and in-line coaching tips.
- **Guided lessons** — each lesson opens with an intro (objectives + key phrases), then a short round of practice exercises (multiple choice, fill-in-the-blank, word bank, true/false, matching) before the free-form conversation.
- **Streaks** — a daily-activity streak and a "today" progress ring, shown in the sidebar, to encourage coming back.
- **Spaced-repetition vocab review** — phrases learned in lessons get added to a review deck and resurface for quick flashcard review on a spaced schedule (1, 2, 4, 7, 14, 30 days), so they stick.
- **Audio: hear + speak** — key phrases and AI replies can be read aloud (browser text-to-speech), and you can practice speaking your reply out loud (browser speech-to-text) instead of typing. Both quietly hide themselves in browsers that don't support them.
- **Accounts & cross-device sync** — a free account (email/password or Google) is required to use Echoly, so progress, streaks, and the review deck sync to the cloud and pick up where you left off on any device. Until `FIREBASE_CONFIG` is filled in with real values (see [Turning on accounts](#turning-on-accounts-firebase) below), this whole gate is skipped and Echoly runs open, account-free, exactly like before — useful for local dev/testing.
- **Rate limiting** on the OpenAI-backed endpoints (`/converse`, `/lookup`, `/lesson-intro`, `/lesson-practice`) so a script can't run up an unbounded OpenAI bill.
- **Privacy Policy** (`privacy.html`) and **Terms of Service** (`tos.html`), linked from the home screen footer.
- **Google Analytics (GA4)** — wired in but off by default (see [Turning on analytics](#turning-on-analytics-ga4) below). With no real measurement ID set, no GA script is ever requested and nothing is tracked.

## Setup

1. Open a terminal in the `server` folder:
   ```
   cd server
   npm install
   ```
2. Copy `.env.example` to `.env` in the `server` folder, and paste in your real OpenAI API key:
   ```
   OPENAI_API_KEY=sk-...
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open `http://localhost:3000` in your browser (don't open `index.html` directly — it needs to be served by the app so its API calls work).

Analytics works out of the box with no setup — it's just inactive until you turn it on (below). Accounts, once `FIREBASE_CONFIG` is filled in, are required to use the app — see below.

## Turning on accounts (Firebase)

Accounts are entirely client-side (no server changes, no `firebase-admin`). Once `FIREBASE_CONFIG` has real values, a visitor must sign in or sign up before reaching any lesson — that's by design, so progress always has somewhere to sync to. Until then, this whole gate is skipped and Echoly runs open. To turn accounts on:

1. Go to the [Firebase console](https://console.firebase.google.com) and create a new project (this needs your own Google login — there's no way to script this part).
2. In your project, go to **Build → Authentication → Sign-in method** and enable the **Email/Password** and **Google** providers.
3. Go to **Build → Firestore Database** and create a database (start in production mode).
4. In Firestore's **Rules** tab, paste in the contents of `firestore.rules` (included alongside this README) and publish. This locks each signed-in user to reading/writing only their own data — no one, including other signed-in users, can read or write anyone else's progress.
5. Go to **Project settings → General**, scroll to "Your apps", and add a Web app (the `</>` icon) if you haven't already. Copy the `firebaseConfig` object it gives you.
6. In `index.html`, find the `FIREBASE_CONFIG` object near the top of the main script and replace the six `YOUR_FIREBASE_...` placeholder values with the real values from step 5.
7. Redeploy. The sign-in gate will appear automatically for every visitor — no other code changes needed.

If Firebase is ever unreachable for a visitor (blocked CDN, offline, etc.), they'll see an honest "couldn't connect" message with a retry button after a few seconds, rather than being let into the app or stuck on an endless loading screen.

## Turning on analytics (GA4)

Analytics is off by default and safe to leave that way — with the placeholder ID in place, no GA script is ever requested and no events fire. To turn it on:

1. In Google Analytics, create a new GA4 property for Echoly (Admin → Create Property) — use a new property rather than reusing one from a different app.
2. Copy your **Measurement ID** (looks like `G-XXXXXXXXXX`, from Admin → Data Streams → your web stream).
3. In `index.html`, `privacy.html`, and `tos.html`, find `var GA_MEASUREMENT_ID = "G-XXXXXXXXXX";` near the top and replace the placeholder with your real ID (same value in all three files).
4. Redeploy. Once a real ID is present, tracking turns on automatically: page views on all three pages, plus `conversation_started` and `message_sent` events from the app.

## Before this goes live for real users

- **`REPLACE_WITH_YOUR_EMAIL`** in `privacy.html` and `tos.html` — replace with your real contact email, so people can reach you with privacy/terms questions.
- **`tos.html`** deliberately doesn't include a governing-law/jurisdiction clause — worth having a lawyer review both `privacy.html` and `tos.html` before real strangers rely on this, same as with any app that talks to a third-party AI provider.
- Set an actual **spending cap/alert** on your OpenAI account so a traffic spike can't run up a surprise bill — the rate limiter is the first line of defense, the OpenAI dashboard cap is the backup. Worth double-checking this is in place now that the app is live with a real key.
- Accounts and analytics are both optional and safe to launch without (see above) — turn them on whenever you're ready, in any order.

## Project structure

```
index.html           — the whole frontend (single file, no build step)
privacy.html          — privacy policy
tos.html               — terms of service
firestore.rules      — security rules to paste into the Firebase console (see "Turning on accounts")
server/server.js     — backend: scenarios, rate limiting, the OpenAI call
server/package.json  — dependencies
server/.env.example  — copy to .env and add your OpenAI key (not committed to git)
```

## Deploying

Built the same way as a typical Render/Railway/Fly-style deploy: one Node service serves both the frontend and the API from the same URL (no separate frontend host, no CORS setup needed). Set `OPENAI_API_KEY` as an environment variable in whatever host you use — don't commit your real `.env` file. Accounts (Firebase) and analytics (GA4) both live entirely in the frontend files, so turning them on is just editing `index.html`/`privacy.html`/`tos.html` and redeploying — no new environment variables or server changes needed.
