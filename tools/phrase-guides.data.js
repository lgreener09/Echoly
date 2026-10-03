// Content for the phrase-guide pages under /learn/ (built by
// build-phrase-guides.js). Every row has the English plus one translation
// per language. Portuguese is Brazilian Portuguese.
//
// "{lang}" in an English string is replaced with the language's name.
// A dialogue line's `enBy` gives a language-specific English gloss where
// the line itself differs (e.g. prices in reais).

const LANGUAGES = [
    { key: "es", name: "Spanish", slug: "spanish", app: "Spanish", locale: "es-ES" },
    { key: "fr", name: "French", slug: "french", app: "French", locale: "fr-FR" },
    { key: "de", name: "German", slug: "german", app: "German", locale: "de-DE" },
    { key: "it", name: "Italian", slug: "italian", app: "Italian", locale: "it-IT" },
    { key: "pt", name: "Portuguese", slug: "portuguese", app: "Portuguese", locale: "pt-BR", note: "Brazilian Portuguese" }
];

const SITUATIONS = [
    {
        slug: "order-coffee",
        title: "order coffee",
        icon: "☕",
        topic: "ordering a coffee at a café counter",
        topicTitle: "Order a coffee",
        intro: "Ordering a coffee is one of the first real conversations you'll have abroad. It's short and predictable, and a great place to build confidence. Here are the phrases you'll actually hear and say at the counter.",
        phrases: [
            { en: "Hello / Good morning", es: "¡Hola! / Buenos días", fr: "Bonjour", de: "Hallo / Guten Morgen", it: "Ciao / Buongiorno", pt: "Oi / Bom dia" },
            { en: "I'd like a coffee, please.", es: "Quisiera un café, por favor.", fr: "Je voudrais un café, s'il vous plaît.", de: "Ich hätte gern einen Kaffee, bitte.", it: "Vorrei un caffè, per favore.", pt: "Eu queria um café, por favor." },
            { en: "A milky coffee (latte), please.", es: "Un café con leche, por favor.", fr: "Un café crème, s'il vous plaît.", de: "Einen Milchkaffee, bitte.", it: "Un caffellatte, per favore.", pt: "Um café com leite, por favor." },
            { en: "Small / medium / large", es: "pequeño / mediano / grande", fr: "petit / moyen / grand", de: "klein / mittel / groß", it: "piccolo / medio / grande", pt: "pequeno / médio / grande" },
            { en: "For here or to go?", es: "¿Para tomar aquí o para llevar?", fr: "Sur place ou à emporter ?", de: "Zum Hiertrinken oder zum Mitnehmen?", it: "Qui o da portare via?", pt: "Para tomar aqui ou para viagem?" },
            { en: "To go, please.", es: "Para llevar, por favor.", fr: "À emporter, s'il vous plaît.", de: "Zum Mitnehmen, bitte.", it: "Da portare via, per favore.", pt: "Para viagem, por favor." },
            { en: "With oat milk, please.", es: "Con leche de avena, por favor.", fr: "Avec du lait d'avoine, s'il vous plaît.", de: "Mit Hafermilch, bitte.", it: "Con latte d'avena, per favore.", pt: "Com leite de aveia, por favor." },
            { en: "How much is it?", es: "¿Cuánto es?", fr: "C'est combien ?", de: "Was macht das?", it: "Quant'è?", pt: "Quanto é?" },
            { en: "Can I pay by card?", es: "¿Puedo pagar con tarjeta?", fr: "Je peux payer par carte ?", de: "Kann ich mit Karte zahlen?", it: "Posso pagare con la carta?", pt: "Posso pagar com cartão?" },
            { en: "Thanks, have a nice day!", es: "¡Gracias, que tenga un buen día!", fr: "Merci, bonne journée !", de: "Danke, schönen Tag noch!", it: "Grazie, buona giornata!", pt: "Obrigado, tenha um bom dia!" }
        ],
        roles: { them: "Barista", you: "You" },
        dialogue: [
            { who: "them", en: "Hi! What can I get you?", es: "¡Hola! ¿Qué le pongo?", fr: "Bonjour ! Qu'est-ce que je vous sers ?", de: "Hallo! Was darf's sein?", it: "Buongiorno! Cosa le preparo?", pt: "Oi! O que vai ser?" },
            { who: "you", en: "I'd like a latte, please.", es: "Quisiera un café con leche, por favor.", fr: "Je voudrais un café crème, s'il vous plaît.", de: "Ich hätte gern einen Milchkaffee, bitte.", it: "Vorrei un caffellatte, per favore.", pt: "Eu queria um café com leite, por favor." },
            { who: "them", en: "Small or large?", es: "¿Pequeño o grande?", fr: "Petit ou grand ?", de: "Klein oder groß?", it: "Piccolo o grande?", pt: "Pequeno ou grande?" },
            { who: "you", en: "Large, to go.", es: "Grande, para llevar.", fr: "Grand, à emporter.", de: "Groß, zum Mitnehmen.", it: "Grande, da portare via.", pt: "Grande, para viagem." },
            { who: "them", en: "That's four euros fifty.", enBy: { pt: "That's twelve reais." }, es: "Son cuatro euros con cincuenta.", fr: "Ça fait quatre euros cinquante.", de: "Das macht vier Euro fünfzig.", it: "Sono quattro euro e cinquanta.", pt: "São doze reais." },
            { who: "you", en: "Here you go. Thanks!", es: "Aquí tiene. ¡Gracias!", fr: "Voilà. Merci !", de: "Bitte schön. Danke!", it: "Ecco a lei. Grazie!", pt: "Aqui está. Obrigado!" }
        ],
        tips: {
            es: "In Spain, \"café con leche\" is the standard milky coffee. \"Quisiera…\" or the very Spanish \"¿Me pone…?\" sounds more natural than \"quiero\" (I want).",
            fr: "In France, \"un café\" means a small espresso, so ask for \"un café crème\" if you want milk. Always say \"Bonjour\" before you order. Skipping it comes across as rude.",
            de: "\"Ich hätte gern…\" is the polite, go-to way to order anything. \"Was macht das?\" (literally \"what does that make?\") is the everyday way to ask for the total.",
            it: "In Italy, \"un caffè\" is an espresso, and ordering just \"latte\" gets you a glass of milk. Locals often drink coffee standing at the bar, which is usually cheaper than sitting down.",
            pt: "In Brazil, a \"cafezinho\" is a small, strong, sweet coffee, often offered for free. \"Eu queria…\" is a polite, natural way to order. Men say \"obrigado\", women say \"obrigada\"."
        }
    },
    {
        slug: "order-at-a-restaurant",
        title: "order at a restaurant",
        icon: "🍽️",
        topic: "ordering dinner at a restaurant",
        topicTitle: "Order dinner",
        intro: "From getting a table to asking for the check, these are the phrases that carry a whole restaurant visit. Learn them once and you can eat out anywhere the language is spoken.",
        phrases: [
            { en: "A table for two, please.", es: "Una mesa para dos, por favor.", fr: "Une table pour deux, s'il vous plaît.", de: "Einen Tisch für zwei, bitte.", it: "Un tavolo per due, per favore.", pt: "Uma mesa para dois, por favor." },
            { en: "I have a reservation under the name…", es: "Tengo una reserva a nombre de…", fr: "J'ai une réservation au nom de…", de: "Ich habe eine Reservierung auf den Namen…", it: "Ho una prenotazione a nome di…", pt: "Tenho uma reserva no nome de…" },
            { en: "Could we have the menu, please?", es: "¿Nos trae la carta, por favor?", fr: "On peut avoir la carte, s'il vous plaît ?", de: "Können wir bitte die Speisekarte haben?", it: "Possiamo vedere il menù, per favore?", pt: "Pode trazer o cardápio, por favor?" },
            { en: "What do you recommend?", es: "¿Qué me recomienda?", fr: "Qu'est-ce que vous me conseillez ?", de: "Was können Sie empfehlen?", it: "Cosa mi consiglia?", pt: "O que você recomenda?" },
            { en: "I'll have the…", es: "Para mí, el / la…", fr: "Je vais prendre le / la…", de: "Ich nehme den / die / das…", it: "Per me, il / la…", pt: "Eu vou querer o / a…" },
            { en: "Is it spicy?", es: "¿Pica?", fr: "C'est épicé ?", de: "Ist das scharf?", it: "È piccante?", pt: "É apimentado?" },
            { en: "I'm allergic to nuts.", es: "Soy alérgico a los frutos secos.", fr: "Je suis allergique aux fruits à coque.", de: "Ich bin allergisch gegen Nüsse.", it: "Sono allergico alla frutta secca.", pt: "Sou alérgico a castanhas." },
            { en: "A glass of water, please.", es: "Un vaso de agua, por favor.", fr: "Un verre d'eau, s'il vous plaît.", de: "Ein Glas Wasser, bitte.", it: "Un bicchiere d'acqua, per favore.", pt: "Um copo de água, por favor." },
            { en: "The check, please.", es: "La cuenta, por favor.", fr: "L'addition, s'il vous plaît.", de: "Die Rechnung, bitte.", it: "Il conto, per favore.", pt: "A conta, por favor." },
            { en: "It was delicious!", es: "¡Estaba delicioso!", fr: "C'était délicieux !", de: "Es war sehr lecker!", it: "Era buonissimo!", pt: "Estava delicioso!" }
        ],
        roles: { them: "Server", you: "You" },
        dialogue: [
            { who: "them", en: "Good evening! Do you have a reservation?", es: "¡Buenas noches! ¿Tienen reserva?", fr: "Bonsoir ! Vous avez réservé ?", de: "Guten Abend! Haben Sie reserviert?", it: "Buonasera! Avete prenotato?", pt: "Boa noite! Vocês têm reserva?" },
            { who: "you", en: "No. A table for two, please.", es: "No. Una mesa para dos, por favor.", fr: "Non. Une table pour deux, s'il vous plaît.", de: "Nein. Einen Tisch für zwei, bitte.", it: "No. Un tavolo per due, per favore.", pt: "Não. Uma mesa para dois, por favor." },
            { who: "them", en: "Of course, follow me. Here's the menu.", es: "Claro, síganme. Aquí tienen la carta.", fr: "Bien sûr, suivez-moi. Voici la carte.", de: "Natürlich, folgen Sie mir. Hier ist die Speisekarte.", it: "Certo, prego, da questa parte. Ecco il menù.", pt: "Claro, podem me acompanhar. Aqui está o cardápio." },
            { who: "you", en: "What do you recommend?", es: "¿Qué nos recomienda?", fr: "Qu'est-ce que vous nous conseillez ?", de: "Was können Sie empfehlen?", it: "Cosa ci consiglia?", pt: "O que você recomenda?" },
            { who: "them", en: "The fish of the day is excellent.", es: "El pescado del día está buenísimo.", fr: "Le poisson du jour est excellent.", de: "Der Fisch des Tages ist ausgezeichnet.", it: "Il pesce del giorno è ottimo.", pt: "O peixe do dia está ótimo." },
            { who: "you", en: "Then I'll have the fish, please.", es: "Entonces, para mí el pescado, por favor.", fr: "Alors je vais prendre le poisson, s'il vous plaît.", de: "Dann nehme ich den Fisch, bitte.", it: "Allora per me il pesce, per favore.", pt: "Então eu vou querer o peixe, por favor." }
        ],
        tips: {
            es: "In Spain, the server won't bring the check until you ask: \"La cuenta, por favor.\" Lunch (around 2pm) is the main meal, and many places offer a good-value \"menú del día\".",
            fr: "Ask for \"une carafe d'eau\" to get free tap water. French servers won't rush you, so ask for \"l'addition\" when you're ready to leave.",
            de: "When paying in Germany, you often say the total including your tip: if the bill is 27 euros, say \"30, bitte\". To split the bill, say \"Getrennt, bitte\" (separately, please).",
            it: "A \"coperto\" on the bill is a normal cover charge, not a mistake. Cappuccino after a meal is unusual in Italy, so order \"un caffè\" instead.",
            pt: "In Brazil, a 10% service charge (\"os dez por cento\") is usually added to the bill. The menu is \"cardápio\" in Brazil but \"ementa\" in Portugal."
        }
    },
    {
        slug: "ask-for-directions",
        title: "ask for directions",
        icon: "🧭",
        topic: "asking a local for directions to the train station",
        topicTitle: "Ask for directions",
        intro: "Asking for directions is easy. Understanding the answer is the hard part. These phrases cover both sides, plus the one phrase every learner needs: \"Could you say that more slowly?\"",
        phrases: [
            { en: "Excuse me", es: "Perdone / Disculpe", fr: "Excusez-moi", de: "Entschuldigung", it: "Mi scusi", pt: "Com licença" },
            { en: "Where is the train station?", es: "¿Dónde está la estación de tren?", fr: "Où est la gare ?", de: "Wo ist der Bahnhof?", it: "Dov'è la stazione?", pt: "Onde fica a estação de trem?" },
            { en: "How do I get to…?", es: "¿Cómo llego a…?", fr: "Comment je fais pour aller à… ?", de: "Wie komme ich zum / zur…?", it: "Come arrivo a…?", pt: "Como eu faço para chegar ao / à…?" },
            { en: "Is it far?", es: "¿Está lejos?", fr: "C'est loin ?", de: "Ist es weit?", it: "È lontano?", pt: "É longe?" },
            { en: "Go straight ahead.", es: "Siga todo recto.", fr: "Allez tout droit.", de: "Gehen Sie geradeaus.", it: "Vada sempre dritto.", pt: "Siga em frente." },
            { en: "Turn left / right.", es: "Gire a la izquierda / a la derecha.", fr: "Tournez à gauche / à droite.", de: "Biegen Sie links / rechts ab.", it: "Giri a sinistra / a destra.", pt: "Vire à esquerda / à direita." },
            { en: "At the traffic lights", es: "En el semáforo", fr: "Au feu", de: "An der Ampel", it: "Al semaforo", pt: "No semáforo" },
            { en: "Could you repeat that more slowly?", es: "¿Puede repetirlo más despacio?", fr: "Vous pouvez répéter plus lentement ?", de: "Können Sie das bitte langsamer wiederholen?", it: "Può ripetere più lentamente?", pt: "Pode repetir mais devagar?" },
            { en: "Can you show me on the map?", es: "¿Me lo puede indicar en el mapa?", fr: "Vous pouvez me montrer sur la carte ?", de: "Können Sie es mir auf der Karte zeigen?", it: "Me lo può indicare sulla mappa?", pt: "Pode me mostrar no mapa?" },
            { en: "Thanks for your help!", es: "¡Gracias por su ayuda!", fr: "Merci pour votre aide !", de: "Danke für Ihre Hilfe!", it: "Grazie dell'aiuto!", pt: "Obrigado pela ajuda!" }
        ],
        roles: { them: "Local", you: "You" },
        dialogue: [
            { who: "you", en: "Excuse me, where is the train station?", es: "Perdone, ¿dónde está la estación de tren?", fr: "Excusez-moi, où est la gare ?", de: "Entschuldigung, wo ist der Bahnhof?", it: "Mi scusi, dov'è la stazione?", pt: "Com licença, onde fica a estação de trem?" },
            { who: "them", en: "Go straight ahead and turn left at the traffic lights.", es: "Siga todo recto y gire a la izquierda en el semáforo.", fr: "Allez tout droit et tournez à gauche au feu.", de: "Gehen Sie geradeaus und biegen Sie an der Ampel links ab.", it: "Vada sempre dritto e al semaforo giri a sinistra.", pt: "Siga em frente e vire à esquerda no semáforo." },
            { who: "you", en: "Is it far?", es: "¿Está lejos?", fr: "C'est loin ?", de: "Ist es weit?", it: "È lontano?", pt: "É longe?" },
            { who: "them", en: "No, about five minutes on foot.", es: "No, unos cinco minutos andando.", fr: "Non, à cinq minutes à pied environ.", de: "Nein, etwa fünf Minuten zu Fuß.", it: "No, circa cinque minuti a piedi.", pt: "Não, uns cinco minutos a pé." },
            { who: "you", en: "Could you repeat that more slowly?", es: "¿Puede repetirlo más despacio?", fr: "Vous pouvez répéter plus lentement ?", de: "Können Sie das bitte langsamer wiederholen?", it: "Può ripetere più lentamente?", pt: "Pode repetir mais devagar?" },
            { who: "them", en: "Of course! Straight, then left at the lights.", es: "¡Claro! Recto, y luego a la izquierda en el semáforo.", fr: "Bien sûr ! Tout droit, puis à gauche au feu.", de: "Klar! Geradeaus, dann an der Ampel links.", it: "Certo! Dritto, poi a sinistra al semaforo.", pt: "Claro! Em frente, depois à esquerda no semáforo." }
        ],
        tips: {
            es: "In Spain, \"andando\" means on foot; in Latin America you'll hear \"caminando\". To say \"take the bus\", use \"tomar el autobús\", which works everywhere.",
            fr: "Opening with \"Excusez-moi, bonjour\" makes people far more willing to help. \"La gare\" is the train station; the bus station is \"la gare routière\".",
            de: "Use \"Sie\" with strangers. \"Zum\" goes with masculine and neuter places (zum Bahnhof), \"zur\" with feminine ones (zur Post).",
            it: "\"Mi scusi\" is polite for strangers; \"scusa\" is for friends. Italians often give directions by landmarks, so listen for phrases like \"dopo la chiesa\" (after the church).",
            pt: "In Brazil, \"trem\" means train (in Portugal it's \"comboio\"). Locals often say \"é logo ali\" (\"it's right there\"), which can still mean a ten-minute walk."
        }
    },
    {
        slug: "check-into-a-hotel",
        title: "check into a hotel",
        icon: "🏨",
        topic: "checking into a hotel and asking about the room",
        topicTitle: "Check into a hotel",
        intro: "Checking in is a conversation you can rehearse before you arrive. Here's what the receptionist will ask, what you'll want to ask back, and how to sort out a problem with your room.",
        phrases: [
            { en: "I have a reservation.", es: "Tengo una reserva.", fr: "J'ai une réservation.", de: "Ich habe eine Reservierung.", it: "Ho una prenotazione.", pt: "Tenho uma reserva." },
            { en: "Under the name…", es: "A nombre de…", fr: "Au nom de…", de: "Auf den Namen…", it: "A nome di…", pt: "No nome de…" },
            { en: "For three nights", es: "Para tres noches", fr: "Pour trois nuits", de: "Für drei Nächte", it: "Per tre notti", pt: "Por três noites" },
            { en: "Is breakfast included?", es: "¿El desayuno está incluido?", fr: "Le petit-déjeuner est compris ?", de: "Ist das Frühstück inklusive?", it: "La colazione è inclusa?", pt: "O café da manhã está incluído?" },
            { en: "What time is checkout?", es: "¿A qué hora hay que dejar la habitación?", fr: "À quelle heure faut-il libérer la chambre ?", de: "Bis wann muss ich auschecken?", it: "A che ora bisogna lasciare la camera?", pt: "Qual é o horário do check-out?" },
            { en: "What's the Wi-Fi password?", es: "¿Cuál es la contraseña del wifi?", fr: "Quel est le mot de passe du wifi ?", de: "Wie ist das WLAN-Passwort?", it: "Qual è la password del wi-fi?", pt: "Qual é a senha do wi-fi?" },
            { en: "Could I have a quieter room?", es: "¿Podría darme una habitación más tranquila?", fr: "Est-ce que je pourrais avoir une chambre plus calme ?", de: "Könnte ich ein ruhigeres Zimmer bekommen?", it: "Potrei avere una camera più tranquilla?", pt: "Poderia me dar um quarto mais silencioso?" },
            { en: "The air conditioning doesn't work.", es: "El aire acondicionado no funciona.", fr: "La climatisation ne marche pas.", de: "Die Klimaanlage funktioniert nicht.", it: "L'aria condizionata non funziona.", pt: "O ar-condicionado não está funcionando." },
            { en: "Can I leave my luggage here?", es: "¿Puedo dejar aquí mi equipaje?", fr: "Je peux laisser mes bagages ici ?", de: "Kann ich mein Gepäck hier lassen?", it: "Posso lasciare qui i bagagli?", pt: "Posso deixar minha bagagem aqui?" },
            { en: "Your passport, please.", es: "Su pasaporte, por favor.", fr: "Votre passeport, s'il vous plaît.", de: "Ihren Reisepass, bitte.", it: "Il passaporto, per favore.", pt: "Seu passaporte, por favor." }
        ],
        roles: { them: "Receptionist", you: "You" },
        dialogue: [
            { who: "them", en: "Good afternoon, welcome! How can I help you?", es: "Buenas tardes, ¡bienvenido! ¿En qué puedo ayudarle?", fr: "Bonjour, bienvenue ! Je peux vous aider ?", de: "Guten Tag und herzlich willkommen! Wie kann ich Ihnen helfen?", it: "Buon pomeriggio, benvenuto! Come posso aiutarla?", pt: "Boa tarde, seja bem-vindo! Em que posso ajudar?" },
            { who: "you", en: "Hi, I have a reservation under the name Smith.", es: "Hola, tengo una reserva a nombre de Smith.", fr: "Bonjour, j'ai une réservation au nom de Smith.", de: "Hallo, ich habe eine Reservierung auf den Namen Smith.", it: "Salve, ho una prenotazione a nome di Smith.", pt: "Oi, tenho uma reserva no nome de Smith." },
            { who: "them", en: "Yes, three nights. Your passport, please.", es: "Sí, tres noches. Su pasaporte, por favor.", fr: "Oui, trois nuits. Votre passeport, s'il vous plaît.", de: "Ja, drei Nächte. Ihren Reisepass, bitte.", it: "Sì, tre notti. Il passaporto, per favore.", pt: "Sim, três noites. Seu passaporte, por favor." },
            { who: "you", en: "Here you go. Is breakfast included?", es: "Aquí tiene. ¿El desayuno está incluido?", fr: "Voilà. Le petit-déjeuner est compris ?", de: "Bitte schön. Ist das Frühstück inklusive?", it: "Ecco. La colazione è inclusa?", pt: "Aqui está. O café da manhã está incluído?" },
            { who: "them", en: "Yes, from seven to ten. Your room is 304.", es: "Sí, de siete a diez. Su habitación es la 304.", fr: "Oui, de sept heures à dix heures. Vous êtes à la chambre 304.", de: "Ja, von sieben bis zehn Uhr. Sie haben Zimmer 304.", it: "Sì, dalle sette alle dieci. La sua camera è la 304.", pt: "Sim, das sete às dez. Seu quarto é o 304." },
            { who: "you", en: "Thank you very much!", es: "¡Muchas gracias!", fr: "Merci beaucoup !", de: "Vielen Dank!", it: "Grazie mille!", pt: "Muito obrigado!" }
        ],
        tips: {
            es: "\"Habitación\" is the standard word for a hotel room; you'll also hear \"cuarto\" in Latin America. \"Buenas tardes\" works from early afternoon until it gets dark.",
            fr: "\"Compris\" and \"inclus\" both mean included. Many French hotels add a small \"taxe de séjour\" (tourist tax) per night when you pay.",
            de: "\"WLAN\" (said \"vay-lahn\") is the German word for Wi-Fi. Quiet hours (\"Ruhezeit\") are taken seriously, especially at night.",
            it: "\"Salve\" is a handy polite greeting when you're unsure whether to use \"ciao\" or \"buongiorno\". Most Italian cities add a \"tassa di soggiorno\" (tourist tax) at check-out.",
            pt: "In Brazil, breakfast is \"café da manhã\"; in Portugal it's \"pequeno-almoço\". The front desk is \"a recepção\"."
        }
    },
    {
        slug: "introduce-yourself",
        title: "introduce yourself",
        icon: "🙋",
        topic: "meeting someone new at a party and introducing yourself",
        topicTitle: "Introduce yourself",
        intro: "Introducing yourself is the conversation you'll have again and again. Get comfortable with these phrases and you'll be ready for parties, language exchanges and meeting a partner's friends.",
        phrases: [
            { en: "Hi, my name is…", es: "Hola, me llamo…", fr: "Bonjour, je m'appelle…", de: "Hallo, ich heiße…", it: "Ciao, mi chiamo…", pt: "Oi, meu nome é…" },
            { en: "Nice to meet you.", es: "Encantado / Encantada.", fr: "Enchanté / Enchantée.", de: "Freut mich.", it: "Piacere.", pt: "Muito prazer." },
            { en: "What's your name?", es: "¿Cómo te llamas?", fr: "Tu t'appelles comment ?", de: "Wie heißt du?", it: "Come ti chiami?", pt: "Qual é o seu nome?" },
            { en: "Where are you from?", es: "¿De dónde eres?", fr: "Tu viens d'où ?", de: "Woher kommst du?", it: "Di dove sei?", pt: "De onde você é?" },
            { en: "I'm from Canada.", es: "Soy de Canadá.", fr: "Je viens du Canada.", de: "Ich komme aus Kanada.", it: "Vengo dal Canada.", pt: "Sou do Canadá." },
            { en: "I live in Toronto.", es: "Vivo en Toronto.", fr: "J'habite à Toronto.", de: "Ich wohne in Toronto.", it: "Abito a Toronto.", pt: "Moro em Toronto." },
            { en: "I work as a…", es: "Trabajo de…", fr: "Je travaille comme…", de: "Ich arbeite als…", it: "Lavoro come…", pt: "Trabalho como…" },
            { en: "I'm learning {lang}.", es: "Estoy aprendiendo español.", fr: "J'apprends le français.", de: "Ich lerne Deutsch.", it: "Sto imparando l'italiano.", pt: "Estou aprendendo português." },
            { en: "What do you like to do in your free time?", es: "¿Qué te gusta hacer en tu tiempo libre?", fr: "Qu'est-ce que tu aimes faire pendant ton temps libre ?", de: "Was machst du gern in deiner Freizeit?", it: "Cosa ti piace fare nel tempo libero?", pt: "O que você gosta de fazer no tempo livre?" },
            { en: "See you soon!", es: "¡Hasta pronto!", fr: "À bientôt !", de: "Bis bald!", it: "A presto!", pt: "Até logo!" }
        ],
        roles: { them: "Ana", you: "You" },
        dialogue: [
            { who: "them", en: "Hi! I'm Ana. What's your name?", es: "¡Hola! Soy Ana. ¿Cómo te llamas?", fr: "Salut ! Moi, c'est Ana. Tu t'appelles comment ?", de: "Hallo! Ich bin Ana. Wie heißt du?", it: "Ciao! Sono Ana. Come ti chiami?", pt: "Oi! Eu sou a Ana. Qual é o seu nome?" },
            { who: "you", en: "My name is Sam. Nice to meet you!", es: "Me llamo Sam. ¡Encantado!", fr: "Je m'appelle Sam. Enchanté !", de: "Ich heiße Sam. Freut mich!", it: "Mi chiamo Sam. Piacere!", pt: "Meu nome é Sam. Muito prazer!" },
            { who: "them", en: "Where are you from?", es: "¿De dónde eres?", fr: "Tu viens d'où ?", de: "Woher kommst du?", it: "Di dove sei?", pt: "De onde você é?" },
            { who: "you", en: "I'm from Canada, and I'm learning {lang}.", es: "Soy de Canadá y estoy aprendiendo español.", fr: "Je viens du Canada et j'apprends le français.", de: "Ich komme aus Kanada und lerne Deutsch.", it: "Vengo dal Canada e sto imparando l'italiano.", pt: "Sou do Canadá e estou aprendendo português." },
            { who: "them", en: "You speak {lang} really well!", es: "¡Hablas muy bien español!", fr: "Tu parles très bien français !", de: "Du sprichst sehr gut Deutsch!", it: "Parli molto bene l'italiano!", pt: "Você fala português muito bem!" },
            { who: "you", en: "Thanks, I'm practicing a lot!", es: "¡Gracias, estoy practicando mucho!", fr: "Merci, je m'entraîne beaucoup !", de: "Danke, ich übe viel!", it: "Grazie, mi sto esercitando molto!", pt: "Obrigado, estou praticando bastante!" }
        ],
        tips: {
            es: "Use \"tú\" with people your age in casual settings and \"usted\" with older people or in formal situations. Men say \"encantado\", women say \"encantada\".",
            fr: "Use \"tu\" with friends and people your age, and \"vous\" with strangers and at work until you're invited to switch. Men write \"enchanté\", women \"enchantée\" (they sound the same).",
            de: "Young Germans switch to \"du\" quickly, but at work wait until you're offered it. A handshake is the normal greeting when you first meet someone.",
            it: "\"Piacere\" is the classic reply when you meet someone. Friends greet each other with a kiss on each cheek, but a handshake is normal the first time.",
            pt: "Brazilians are warm and informal, and \"você\" works almost everywhere. Expect friendly follow-up questions, because small talk is a big part of meeting people."
        }
    },
    {
        slug: "make-a-doctors-appointment",
        title: "make a doctor's appointment",
        icon: "🩺",
        topic: "phoning a doctor's office to make an appointment because you have a fever and a sore throat",
        topicTitle: "Book a doctor",
        intro: "Calling a doctor's office is stressful in any language, especially on the phone. These phrases help you book the appointment and describe what's wrong clearly.",
        phrases: [
            { en: "I'd like to make an appointment.", es: "Quisiera pedir cita.", fr: "Je voudrais prendre rendez-vous.", de: "Ich möchte einen Termin vereinbaren.", it: "Vorrei prendere un appuntamento.", pt: "Eu gostaria de marcar uma consulta." },
            { en: "I don't feel well.", es: "No me encuentro bien.", fr: "Je ne me sens pas bien.", de: "Mir geht es nicht gut.", it: "Non mi sento bene.", pt: "Não estou me sentindo bem." },
            { en: "I have a fever.", es: "Tengo fiebre.", fr: "J'ai de la fièvre.", de: "Ich habe Fieber.", it: "Ho la febbre.", pt: "Estou com febre." },
            { en: "My throat hurts.", es: "Me duele la garganta.", fr: "J'ai mal à la gorge.", de: "Ich habe Halsschmerzen.", it: "Mi fa male la gola.", pt: "Estou com dor de garganta." },
            { en: "Since yesterday", es: "Desde ayer", fr: "Depuis hier", de: "Seit gestern", it: "Da ieri", pt: "Desde ontem" },
            { en: "Do you have anything available tomorrow?", es: "¿Tiene algo para mañana?", fr: "Vous avez une disponibilité demain ?", de: "Haben Sie morgen einen Termin frei?", it: "C'è disponibilità per domani?", pt: "Tem algum horário amanhã?" },
            { en: "In the morning / afternoon", es: "Por la mañana / por la tarde", fr: "Le matin / l'après-midi", de: "Vormittags / nachmittags", it: "Di mattina / di pomeriggio", pt: "De manhã / à tarde" },
            { en: "Is it urgent?", es: "¿Es urgente?", fr: "C'est urgent ?", de: "Ist es dringend?", it: "È urgente?", pt: "É urgente?" },
            { en: "I'm allergic to penicillin.", es: "Soy alérgico a la penicilina.", fr: "Je suis allergique à la pénicilline.", de: "Ich bin allergisch gegen Penicillin.", it: "Sono allergico alla penicillina.", pt: "Sou alérgico à penicilina." },
            { en: "Do I need a prescription?", es: "¿Necesito receta?", fr: "J'ai besoin d'une ordonnance ?", de: "Brauche ich ein Rezept?", it: "Mi serve la ricetta?", pt: "Preciso de receita?" }
        ],
        roles: { them: "Receptionist", you: "You" },
        dialogue: [
            { who: "them", en: "Good morning, Dr. Rossi's office.", es: "Buenos días, consulta del doctor Rossi.", fr: "Bonjour, cabinet du docteur Rossi.", de: "Guten Morgen, Praxis Dr. Rossi.", it: "Buongiorno, studio del dottor Rossi.", pt: "Bom dia, consultório do doutor Rossi." },
            { who: "you", en: "Hello, I'd like to make an appointment.", es: "Hola, quisiera pedir cita.", fr: "Bonjour, je voudrais prendre rendez-vous.", de: "Hallo, ich möchte einen Termin vereinbaren.", it: "Buongiorno, vorrei prendere un appuntamento.", pt: "Oi, eu gostaria de marcar uma consulta." },
            { who: "them", en: "Of course. What's the problem?", es: "Claro. ¿Qué le pasa?", fr: "Bien sûr. Qu'est-ce qui vous arrive ?", de: "Gern. Was fehlt Ihnen denn?", it: "Certo. Qual è il problema?", pt: "Claro. O que você está sentindo?" },
            { who: "you", en: "I've had a fever and a sore throat since yesterday.", es: "Tengo fiebre y me duele la garganta desde ayer.", fr: "J'ai de la fièvre et mal à la gorge depuis hier.", de: "Ich habe seit gestern Fieber und Halsschmerzen.", it: "Ho la febbre e mal di gola da ieri.", pt: "Estou com febre e dor de garganta desde ontem." },
            { who: "them", en: "We have an opening tomorrow at nine.", es: "Tenemos un hueco mañana a las nueve.", fr: "J'ai une disponibilité demain à neuf heures.", de: "Wir hätten morgen um neun Uhr einen Termin frei.", it: "Abbiamo un posto libero domani alle nove.", pt: "Temos um horário amanhã às nove." },
            { who: "you", en: "Perfect, thank you.", es: "Perfecto, gracias.", fr: "Parfait, merci.", de: "Perfekt, danke.", it: "Perfetto, grazie.", pt: "Perfeito, obrigado." }
        ],
        tips: {
            es: "\"Pedir cita\" means to book an appointment. To say something hurts, use \"me duele\" plus the body part: \"me duele la cabeza\" (my head hurts).",
            fr: "\"J'ai mal à…\" is how you say something hurts: \"j'ai mal au dos\" (my back hurts). Many people in France book online, but calling the \"cabinet\" works everywhere.",
            de: "\"Termin\" (appointment) is one of the most useful words in everyday German. At the practice you'll usually be asked for your \"Versicherungskarte\" (insurance card).",
            it: "\"Mi fa male…\" means \"…hurts\": \"mi fa male la testa\" (my head hurts). In Italy a \"ricetta\" is a prescription as well as a recipe.",
            pt: "In Brazil, \"estou com…\" is how you describe symptoms: \"estou com dor de cabeça\" (I have a headache). \"Consulta\" is the appointment and \"receita\" is the prescription."
        }
    }
];

module.exports = { LANGUAGES, SITUATIONS };
