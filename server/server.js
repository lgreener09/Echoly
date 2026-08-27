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
// Ordered as a single progression path — index order matters here (it's
// mirrored in index.html's PATH array) since lessons unlock sequentially,
// one at a time, grouped visually into three difficulty tiers.
const SCENARIOS = {
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
