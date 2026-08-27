# Echoly

An AI conversation-practice app: pick a language and a real-life scenario (ordering coffee, asking directions, a doctor's visit, and more), and have an actual back-and-forth conversation with an AI playing that role — with a quick tip whenever something you say isn't quite how a native speaker would phrase it. Not vocab drills — real conversation practice.

## What's included

- **The app** (`index.html` + `server/server.js`) — 6 scenarios, 6 languages, AI roleplay with translation toggle and in-line coaching tips.
- **Rate limiting** on `/converse` (the only endpoint that costs money per call) so a script can't run up an unbounded OpenAI bill.
- **Privacy Policy** (`privacy.html`) and **Terms of Service** (`tos.html`), linked from the home screen footer.
- **Google Analytics (GA4)** wired in on every page, tracking `conversation_started` and `message_sent` as conversion events.

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

## Before this goes live for real users

A few placeholders need your real values — search each file for these:

- **`G-XXXXXXXXXX`** in `index.html`, `privacy.html`, and `tos.html` — replace with your real GA4 measurement ID. Create a new property in Google Analytics (Admin → Create Property) since this is a different app than any previous one.
- **`REPLACE_WITH_YOUR_EMAIL`** in `privacy.html` and `tos.html` — your real contact email, so people can reach you with privacy/terms questions.
- **`tos.html`** deliberately doesn't include a governing-law/jurisdiction clause — worth having a lawyer review both `privacy.html` and `tos.html` before real strangers rely on this, same as with any app that talks to a third-party AI provider.
- Set an actual **spending cap/alert** on your OpenAI account so a traffic spike can't run up a surprise bill — the rate limiter is the first line of defense, the OpenAI dashboard cap is the backup.

## Project structure

```
index.html          — the whole frontend (single file, no build step)
privacy.html         — privacy policy
tos.html              — terms of service
server/server.js    — backend: scenarios, rate limiting, the OpenAI call
server/package.json — dependencies
server/.env.example — copy to .env and add your OpenAI key (not committed to git)
```

## Deploying

Built the same way as a typical Render/Railway/Fly-style deploy: one Node service serves both the frontend and the API from the same URL (no separate frontend host, no CORS setup needed). Set `OPENAI_API_KEY` as an environment variable in whatever host you use — don't commit your real `.env` file.
