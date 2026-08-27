require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");

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
app.use(express.json({ limit: "1mb" }));

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

// Serves the frontend (index.html, one level up from this server/ folder)
// from this same Express app — one service, one URL, no CORS setup needed
// between two different domains. Locally, open http://localhost:3000 during
// development (not index.html directly).
app.use(express.static(path.join(__dirname, "..")));

// ==============================
// Scenarios
// ==============================
// Each scenario just needs a short human-facing description plus a "who am
// I talking to" character brief for the system prompt — the AI generates
// the actual dialogue dynamically, so there's no per-language content to
// maintain. Adding a new scenario later is a matter of adding one entry
// here, not building out new screens or content.
const SCENARIOS = {
    cafe_order: {
        title: "Order a coffee",
        blurb: "Practice ordering at a café counter.",
        icon: "☕",
        character: "a friendly barista working the counter at a busy café",
        opening: "greet the customer and ask what they'd like"
    },
    directions: {
        title: "Ask for directions",
        blurb: "Stop a stranger on the street and find your way somewhere.",
        icon: "🧭",
        character: "a friendly local stranger stopped on a city street",
        opening: "notice the person seems to be looking for something and ask if they need help"
    },
    hotel_checkin: {
        title: "Check into a hotel",
        blurb: "Arrive at the front desk and check into your room.",
        icon: "🏨",
        character: "a hotel front-desk clerk",
        opening: "greet the guest and ask if they have a reservation"
    },
    coworker_smalltalk: {
        title: "Meet a new coworker",
        blurb: "Introduce yourself and make small talk on your first day.",
        icon: "🤝",
        character: "a friendly coworker meeting this person for the first time on their first day",
        opening: "introduce yourself and welcome them"
    },
    doctor_visit: {
        title: "Describe symptoms to a doctor",
        blurb: "Explain how you're feeling at a doctor's appointment.",
        icon: "🩺",
        character: "a calm, attentive doctor at a routine appointment",
        opening: "greet the patient and ask what brings them in today"
    },
    restaurant_reservation: {
        title: "Book a dinner reservation",
        blurb: "Call a restaurant and reserve a table.",
        icon: "🍽️",
        character: "a restaurant host answering the phone to take reservations",
        opening: "answer the phone as the restaurant and ask how you can help"
    }
};

// Languages the model can roleplay in without any extra setup — this list
// is just what's offered in the UI dropdown; adding another language later
// is a one-line addition here, not new content to write.
const LANGUAGES = ["Spanish", "French", "Italian", "German", "Portuguese", "Japanese"];

function buildSystemPrompt(language, scenario) {
    return `You are roleplaying as ${scenario.character}, to help someone practice having a real, natural conversation in ${language}. Scenario: ${scenario.blurb}

Rules for every turn:
- Stay fully in character. Write "reply" ONLY in ${language} — short (1-3 sentences), natural, everyday phrasing a real native speaker would actually use in this situation, not textbook-formal language.
- "replyTranslation" is a plain English translation of exactly what you wrote in "reply", so the learner can check their understanding. Never put English in "reply" itself.
- Look at the learner's last message (in ${language}). If anything was unnatural, grammatically off, or not how a native speaker would actually say it, put ONE short, specific, encouraging coaching note in "tip" (English, max 2 sentences) — show what they said and a more natural way to say it. If their message was already good, or this is the very first turn, leave "tip" as an empty string. Never put coaching inside "reply" — that field is 100% in-character.
- If the learner writes in English or seems stuck, stay in character in ${language} but simplify your reply, and use "tip" to gently suggest a phrase they could use.
- The learner's message will be exactly "__START__" only to signal the very start of the conversation — when you see that, ${scenario.opening}, as your character naturally would, and leave "tip" empty. Never mention "__START__" or break character to acknowledge it.`;
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
            tip: { type: "string" }
        },
        required: ["reply", "replyTranslation", "tip"],
        additionalProperties: false
    }
};

// ==============================
// Health check
// ==============================
app.get("/", (req, res) => {
    res.json({ status: "online", app: "Echoly" });
});

app.get("/scenarios", (req, res) => {
    const list = Object.entries(SCENARIOS).map(([id, s]) => ({
        id, title: s.title, blurb: s.blurb, icon: s.icon
    }));
    res.json({ scenarios: list, languages: LANGUAGES });
});

// ==============================
// Conversation turn — real OpenAI call
// ==============================
// The client sends the full running history each turn (simple and stateless
// server-side — no session storage to manage) plus the new message. To
// start a fresh conversation, the client sends message: "__START__" with an
// empty history.
app.post("/converse", conversationLimiter, async (req, res) => {
    try {
        const { scenarioId, language, history, message } = req.body;

        const scenario = SCENARIOS[scenarioId];
        if (!scenario) {
            return res.status(400).json({ error: "Unknown scenario." });
        }
        if (!LANGUAGES.includes(language)) {
            return res.status(400).json({ error: "Unsupported language." });
        }
        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "Message is required." });
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
            .map(turn => ({ role: turn.role, content: turn.content }));

        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildSystemPrompt(language, scenario) },
                ...historyInput,
                { role: "user", content: message }
            ],
            text: { format: CONVERSATION_JSON_SCHEMA }
        });

        const result = JSON.parse(response.output_text);
        res.json({ success: true, ...result });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Couldn't get a reply: " + (error.message || "unknown error")
        });
    }
});

// Render (and most hosts) assign their own port via the PORT environment
// variable — the app has to listen on whatever they hand it, not a
// hardcoded number, or the deploy fails to come up. Locally, nothing sets
// PORT, so this still falls back to 3000 exactly as before.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Echoly server running at http://localhost:${PORT}`);
});
