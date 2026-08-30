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
    cafe_order: {
        tier: "Beginner",
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

// Languages the model can roleplay in without any extra setup — this list
// is just what's offered in the UI dropdown; adding another language later
// is a one-line addition here, not new content to write (buildSystemPrompt
// below builds the roleplay instructions dynamically for whichever language
// is selected).
const LANGUAGES = [
    "Spanish", "French", "Italian", "German", "Portuguese", "Japanese",
    "Mandarin Chinese", "Korean", "Arabic", "Russian", "Hindi", "Dutch",
    "Greek", "Turkish", "Polish", "Swedish", "Vietnamese", "Thai", "Indonesian", "Hebrew"
];

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
function buildSystemPrompt(language, scenario, objectives, keyPhrases, vocabHistory) {
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
    const isIntro = scenario.tier === "Intro";
    const hasKnownPhrases = allKnownPhrases.length > 0;
    const knownPhrasesList = hasKnownPhrases
        ? allKnownPhrases.map(p => `- ${p.phrase} (${p.translation})`).join("\n")
        : "";

    let levelGuidance = "";
    if (isIntro) {
        levelGuidance = `\n\nThis is a BASICS lesson — assume the learner may not know any ${language} yet. This overrides the usual "reply" and "tip" rules above.${hasKnownPhrases ? `\n\nThe learner has been shown this exact, complete list of ${language} phrases so far — this lesson's phrases plus every earlier basics lesson they've already completed — and nothing else:\n${knownPhrasesList}\n\nHard rules for "reply" in this lesson:\n- Use ONLY the phrases above (plus a name the learner gives you) — never introduce a new word, verb form, or sentence structure that isn't on that list.\n- "reply" must be just ONE short phrase from that list, standing alone — a greeting or exclamation, not a full sentence explaining what to say or how to say it (no "you can say...", no connecting clauses). Someone meeting this word for the very first time needs to see it used plainly, not embedded in a bigger sentence.` : `\n\nKeep "reply" itself to one very short, simple phrase — no subordinate clauses or explaining what to say, just a plain in-character reaction.`}\n- Every turn in this lesson, including the very first ("__START__") turn, use "tip" to explicitly hand them the next phrase to try — the exact ${language} phrase plus its English meaning, e.g. "Try saying: ¡Hola! — it means Hello." Never leave "tip" empty in this lesson, not even on a good attempt or the first turn — there should always be a next phrase to try. That's the only field where any teaching or explaining happens — never inside "reply".\n- Be warm and encouraging about any attempt, even an imperfect one — the vocabulary being minimal doesn't mean the tone should be flat.`;
    } else if (hasKnownPhrases) {
        // Beyond the intro track, a hard allowlist gets unworkable fast (by
        // lesson 20+ it's a huge fixed phrase list and every reply starts
        // sounding the same) — so this is a soft ceiling instead: stay close
        // to what's actually been taught, but allow the ordinary grammar and
        // connecting words needed to build a real sentence at this level.
        levelGuidance = `\n\nThe learner has completed earlier lessons in ${language}, and between those and this lesson's own key phrases has been taught this vocabulary so far:\n${knownPhrasesList}\n\nUse this as a guide, not a strict allowlist: lean on these words where they naturally fit, and it's fine to use ordinary grammar and connecting words (articles, basic verb conjugations, pronouns, prepositions, common function words) needed to form a natural sentence at a ${scenario.tier.toLowerCase()} level. But don't reach for advanced or obscure vocabulary the learner hasn't been shown any equivalent of yet just because it fits the scenario well — when in doubt, prefer the simpler word a learner at this point in the course would actually recognize.`;
    }

    return `You are roleplaying as ${scenario.character}, to help someone practice having a real, natural conversation in ${language}. Scenario: ${scenario.blurb}

Rules for every turn:
- Stay fully in character. Write "reply" ONLY in ${language} — short (1-3 sentences), natural, everyday phrasing a real native speaker would actually use in this situation, not textbook-formal language.
- "replyTranslation" is a plain English translation of exactly what you wrote in "reply", so the learner can check their understanding. Never put English in "reply" itself.
- Look at the learner's last message (in ${language}). If anything was unnatural, grammatically off, or not how a native speaker would actually say it, put ONE short, specific, encouraging coaching note in "tip" (English, max 2 sentences) — show what they said and a more natural way to say it. If their message was already good, or this is the very first turn, leave "tip" as an empty string. Never put coaching inside "reply" — that field is 100% in-character.
- If the learner writes in English or seems stuck, stay in character in ${language} but simplify your reply, and use "tip" to gently suggest a phrase they could use.
- The learner's message will be exactly "__START__" only to signal the very start of the conversation — when you see that, ${scenario.opening}, as your character naturally would, and leave "tip" empty. Never mention "__START__" or break character to acknowledge it.${levelGuidance}${objectivesSection}`;
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
            tip: { type: "string" },
            completedObjectives: { type: "array", items: { type: "integer" } }
        },
        required: ["reply", "replyTranslation", "tip", "completedObjectives"],
        additionalProperties: false
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
function buildLessonIntroPrompt(language, scenario) {
    if (scenario.tier === "Intro") {
        return `The learner is an absolute beginner about to learn some of their very first words of ${language}, on this topic: ${scenario.blurb}

- "objectives": exactly 3 short, concrete goals for this lesson (in English, each under 8 words, phrased like a checklist item) — focused on LEARNING and trying out new words on this topic, not on accomplishing a task (e.g. "Learn to say hello", "Learn to say goodbye", "Try greeting the tutor").
- "keyPhrases": 5 to 8 essential ${language} words or phrases for this specific topic, each with its plain English translation — exactly the vocabulary this lesson is meant to teach, simple and commonly used, ordered from most to least essential.`;
    }
    return `The learner is about to practice this scenario in ${language}: ${scenario.blurb} They'll be roleplaying with ${scenario.character}.

- "objectives": exactly 3 short, concrete goals for what the learner should try to accomplish during this conversation (in English, each under 8 words, phrased like a checklist item — e.g. "Greet the barista", "Order a drink", "Ask the price"). Make them specific to this scenario, not generic filler.
- "keyPhrases": 4 to 6 short, useful phrases in ${language} the learner will likely want for this scenario, each with its plain English translation — natural, everyday phrasing a native speaker would actually use, not textbook-formal.`;
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
                        translation: { type: "string" }
                    },
                    required: ["phrase", "translation"],
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
function buildLessonPracticePrompt(language, scenario) {
    const isIntro = scenario.tier === "Intro";
    const levelNote = isIntro
        ? `The learner is an absolute beginner — keep every word and sentence extremely simple, using only vocabulary a total beginner would already have been taught for this exact topic.`
        : `The learner already knows some ${language} — keep vocabulary and sentence complexity appropriate for a ${scenario.tier.toLowerCase()}-level learner.`;

    return `Before roleplaying this scenario in ${language}, the learner does a short warm-up practice round testing vocabulary and phrases for this topic: ${scenario.blurb}
${levelNote}

Generate exactly 5 practice exercises, one of each of these types, in this exact order: "multiple_choice", "fill_blank", "word_bank", "true_false", "matching". Every exercise must be tightly focused on vocabulary and phrases relevant to this specific topic, and each exercise's "kind" field must be set to exactly the matching type name below.

- multiple_choice: "prompt" is a short ${language} word or phrase. "options" is an array of exactly 4 short English translations, only one of which is correct. "correctIndex" is the 0-based index of the correct option.
- fill_blank: "sentence" is a short ${language} sentence with exactly one blank shown as "___". "correctAnswer" is the single ${language} word or short phrase that correctly fills the blank. "translation" is the English translation of the complete, correct sentence.
- word_bank: "englishPrompt" is a short English sentence. "words" is that sentence's ${language} translation split into individual words/tokens, given in SCRAMBLED (shuffled) order. "correctOrder" is an array of the same length giving the 0-based indices into "words" that puts them back into a grammatically correct ${language} sentence.
- true_false: "statement" is one English sentence claiming that a specific ${language} word or phrase means something — sometimes make the claim true, sometimes false. "isTrue" is whether the claim is actually correct.
- matching: "pairs" is an array of exactly 4 objects, each with a "term" (a ${language} word or phrase for this topic) and its "meaning" (the correct English translation).

Every exercise also needs a short "instruction" field in plain English telling the learner what to do, e.g. "Choose the correct meaning", "Fill in the blank", "Put the words in order", "True or false?", "Match each word to its meaning".`;
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
                                options: { type: "array", items: { type: "string" } },
                                correctIndex: { type: "integer" }
                            },
                            required: ["kind", "instruction", "prompt", "options", "correctIndex"],
                            additionalProperties: false
                        },
                        {
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["fill_blank"] },
                                instruction: { type: "string" },
                                sentence: { type: "string" },
                                correctAnswer: { type: "string" },
                                translation: { type: "string" }
                            },
                            required: ["kind", "instruction", "sentence", "correctAnswer", "translation"],
                            additionalProperties: false
                        },
                        {
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["word_bank"] },
                                instruction: { type: "string" },
                                englishPrompt: { type: "string" },
                                words: { type: "array", items: { type: "string" } },
                                correctOrder: { type: "array", items: { type: "integer" } }
                            },
                            required: ["kind", "instruction", "englishPrompt", "words", "correctOrder"],
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
                                            meaning: { type: "string" }
                                        },
                                        required: ["term", "meaning"],
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
function buildLookupPrompt(language) {
    return `The learner is studying ${language}. They will send a short word, phrase, or saying — it may be written in English or in ${language}.

- "translation": if what they sent is in English, translate it into natural, everyday ${language} — how a native speaker would actually say it in conversation, not a stiff word-for-word translation. If what they sent is already in ${language}, translate it into natural English instead.
- "relatedPhrases": give 4 to 6 other short, useful phrases or sayings in ${language} that are related in topic or would come up in the same kind of conversation as what they searched — each with its plain English translation. These should genuinely help the learner go deeper on the topic they searched, not just be random unrelated phrases.`;
}

const LOOKUP_JSON_SCHEMA = {
    type: "json_schema",
    name: "phrase_lookup",
    strict: true,
    schema: {
        type: "object",
        properties: {
            translation: { type: "string" },
            relatedPhrases: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        phrase: { type: "string" },
                        translation: { type: "string" }
                    },
                    required: ["phrase", "translation"],
                    additionalProperties: false
                }
            }
        },
        required: ["translation", "relatedPhrases"],
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
        id, tier: s.tier, title: s.title, blurb: s.blurb, icon: s.icon
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
        const { scenarioId, language, history, message, objectives, keyPhrases, vocabHistory } = req.body;

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
                { role: "system", content: buildSystemPrompt(language, scenario, safeObjectives, safeKeyPhrases, safeVocabHistory) },
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

        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildLessonIntroPrompt(language, scenario) },
                { role: "user", content: "Generate the lesson intro." }
            ],
            text: { format: LESSON_INTRO_JSON_SCHEMA }
        });

        const result = JSON.parse(response.output_text);
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

        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildLessonPracticePrompt(language, scenario) },
                { role: "user", content: "Generate the practice round." }
            ],
            text: { format: PRACTICE_JSON_SCHEMA }
        });

        const result = JSON.parse(response.output_text);
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

        const response = await getClient().responses.create({
            model: MODEL,
            input: [
                { role: "system", content: buildLookupPrompt(language) },
                { role: "user", content: trimmedPhrase }
            ],
            text: { format: LOOKUP_JSON_SCHEMA }
        });

        const result = JSON.parse(response.output_text);
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

// Render (and most hosts) assign their own port via the PORT environment
// variable — the app has to listen on whatever they hand it, not a
// hardcoded number, or the deploy fails to come up. Locally, nothing sets
// PORT, so this still falls back to 3000 exactly as before.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Echoly server running at http://localhost:${PORT}`);
});
