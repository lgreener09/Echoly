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
    },
    {
        slug: "buy-a-train-ticket",
        title: "buy a train ticket",
        icon: "🚆",
        topic: "buying a train ticket at the station and asking which platform to go to",
        topicTitle: "Buy a train ticket",
        intro: "Train stations are busy, announcements are fast, and the ticket office queue doesn't wait. These phrases get you the right ticket, the right platform and the right train.",
        phrases: [
            { en: "A ticket to the airport, please.", es: "Un billete para el aeropuerto, por favor.", fr: "Un billet pour l'aéroport, s'il vous plaît.", de: "Eine Fahrkarte zum Flughafen, bitte.", it: "Un biglietto per l'aeroporto, per favore.", pt: "Uma passagem para o aeroporto, por favor." },
            { en: "One way / return (round trip)", es: "Solo ida / ida y vuelta", fr: "Aller simple / aller-retour", de: "Einfach / hin und zurück", it: "Solo andata / andata e ritorno", pt: "Só ida / ida e volta" },
            { en: "When does the next train leave?", es: "¿A qué hora sale el próximo tren?", fr: "À quelle heure part le prochain train ?", de: "Wann fährt der nächste Zug?", it: "A che ora parte il prossimo treno?", pt: "Que horas sai o próximo trem?" },
            { en: "Which platform?", es: "¿De qué andén sale?", fr: "C'est quel quai ?", de: "Von welchem Gleis?", it: "Da quale binario parte?", pt: "Qual é a plataforma?" },
            { en: "Do I have to change trains?", es: "¿Tengo que hacer transbordo?", fr: "Est-ce que je dois changer de train ?", de: "Muss ich umsteigen?", it: "Devo cambiare treno?", pt: "Preciso fazer baldeação?" },
            { en: "How long does the trip take?", es: "¿Cuánto dura el viaje?", fr: "Combien de temps dure le trajet ?", de: "Wie lange dauert die Fahrt?", it: "Quanto dura il viaggio?", pt: "Quanto tempo dura a viagem?" },
            { en: "A window seat, please.", es: "Un asiento de ventanilla, por favor.", fr: "Une place côté fenêtre, s'il vous plaît.", de: "Einen Fensterplatz, bitte.", it: "Un posto vicino al finestrino, per favore.", pt: "Um assento na janela, por favor." },
            { en: "Is there a student discount?", es: "¿Hay descuento para estudiantes?", fr: "Il y a une réduction pour les étudiants ?", de: "Gibt es eine Ermäßigung für Studenten?", it: "C'è uno sconto per studenti?", pt: "Tem desconto para estudante?" },
            { en: "The train is delayed.", es: "El tren lleva retraso.", fr: "Le train a du retard.", de: "Der Zug hat Verspätung.", it: "Il treno è in ritardo.", pt: "O trem está atrasado." },
            { en: "Is this seat free?", es: "¿Está libre este asiento?", fr: "Cette place est libre ?", de: "Ist der Platz noch frei?", it: "È libero questo posto?", pt: "Este lugar está livre?" }
        ],
        roles: { them: "Ticket clerk", you: "You" },
        dialogue: [
            { who: "them", en: "Next, please!", es: "¡El siguiente, por favor!", fr: "Au suivant, s'il vous plaît !", de: "Der Nächste, bitte!", it: "Il prossimo, prego!", pt: "Próximo, por favor!" },
            { who: "you", en: "A return ticket to the airport, please.", es: "Un billete de ida y vuelta para el aeropuerto, por favor.", fr: "Un aller-retour pour l'aéroport, s'il vous plaît.", de: "Eine Fahrkarte zum Flughafen, hin und zurück, bitte.", it: "Un biglietto di andata e ritorno per l'aeroporto, per favore.", pt: "Uma passagem de ida e volta para o aeroporto, por favor." },
            { who: "them", en: "That's twelve euros. The next train leaves at 10:15.", enBy: { pt: "That's eighteen reais. The next train leaves at 10:15." }, es: "Son doce euros. El próximo tren sale a las diez y cuarto.", fr: "Ça fait douze euros. Le prochain train part à dix heures quinze.", de: "Das macht zwölf Euro. Der nächste Zug fährt um zehn Uhr fünfzehn.", it: "Sono dodici euro. Il prossimo treno parte alle dieci e un quarto.", pt: "São dezoito reais. O próximo trem sai às dez e quinze." },
            { who: "you", en: "Which platform does it leave from?", es: "¿De qué andén sale?", fr: "Il part de quel quai ?", de: "Von welchem Gleis fährt er?", it: "Da quale binario parte?", pt: "Sai de qual plataforma?" },
            { who: "them", en: "Platform three.", es: "Del andén tres.", fr: "Du quai numéro trois.", de: "Von Gleis drei.", it: "Dal binario tre.", pt: "Da plataforma três." },
            { who: "you", en: "Great, thank you!", es: "¡Genial, gracias!", fr: "Super, merci !", de: "Super, danke!", it: "Perfetto, grazie!", pt: "Ótimo, obrigado!" }
        ],
        tips: {
            es: "In Spain a train ticket is a \"billete\" (in Latin America, \"boleto\"). \"Andén\" is the platform you stand on, and \"vía\" is the track number shown on the departure board.",
            fr: "If there's a yellow machine, validate (\"composter\") a paper ticket for a regional train before boarding. \"Quai\" is the platform and \"voie\" the track number on the board.",
            de: "\"Umsteigen\" (to change trains) is the word to listen for. The \"Gleis\" number is on the departure board, and so is any \"Verspätung\" (delay).",
            it: "On regional trains, validate (\"convalidare\") a paper ticket in the small machine before you board, or you can be fined. \"Binario\" is the platform.",
            pt: "In Brazil, long trips are usually by bus from the \"rodoviária\", while trains (\"trem\") and the metro run within big cities. \"Passagem\" is the word for a travel ticket."
        }
    },
    {
        slug: "shop-for-clothes",
        title: "shop for clothes",
        icon: "👕",
        topic: "shopping for clothes in a store and asking for a different size",
        topicTitle: "Shop for clothes",
        intro: "Sizes, colors, fitting rooms and the all-important \"I'll take it\". Here's everything you need to shop for clothes without pointing and hoping for the best.",
        phrases: [
            { en: "I'm just looking, thanks.", es: "Solo estoy mirando, gracias.", fr: "Je regarde seulement, merci.", de: "Ich schaue mich nur um, danke.", it: "Sto solo dando un'occhiata, grazie.", pt: "Só estou dando uma olhada, obrigado." },
            { en: "Do you have this in a medium?", es: "¿Lo tiene en la talla M?", fr: "Vous l'avez en M ?", de: "Haben Sie das in M?", it: "Ce l'ha nella taglia M?", pt: "Tem esse no tamanho M?" },
            { en: "Do you have it in another color?", es: "¿Lo tiene en otro color?", fr: "Vous l'avez dans une autre couleur ?", de: "Haben Sie das in einer anderen Farbe?", it: "Ce l'ha in un altro colore?", pt: "Tem em outra cor?" },
            { en: "Where are the fitting rooms?", es: "¿Dónde están los probadores?", fr: "Où sont les cabines d'essayage ?", de: "Wo sind die Umkleidekabinen?", it: "Dove sono i camerini?", pt: "Onde ficam os provadores?" },
            { en: "Can I try it on?", es: "¿Me lo puedo probar?", fr: "Je peux l'essayer ?", de: "Kann ich das anprobieren?", it: "Posso provarlo?", pt: "Posso experimentar?" },
            { en: "It's too big / too small.", es: "Me queda grande / pequeño.", fr: "C'est trop grand / trop petit.", de: "Das ist zu groß / zu klein.", it: "È troppo grande / troppo piccolo.", pt: "Está grande demais / pequeno demais." },
            { en: "It fits well.", es: "Me queda bien.", fr: "Ça me va bien.", de: "Das passt gut.", it: "Mi sta bene.", pt: "Ficou bom." },
            { en: "How much does it cost?", es: "¿Cuánto cuesta?", fr: "Combien ça coûte ?", de: "Wie viel kostet das?", it: "Quanto costa?", pt: "Quanto custa?" },
            { en: "Is it on sale?", es: "¿Está rebajado?", fr: "C'est en solde ?", de: "Ist das reduziert?", it: "È in saldo?", pt: "Está em promoção?" },
            { en: "I'll take it.", es: "Me lo llevo.", fr: "Je le prends.", de: "Ich nehme es.", it: "Lo prendo.", pt: "Vou levar." }
        ],
        roles: { them: "Shop assistant", you: "You" },
        dialogue: [
            { who: "them", en: "Hello! Can I help you?", es: "¡Hola! ¿Le puedo ayudar?", fr: "Bonjour ! Je peux vous aider ?", de: "Hallo! Kann ich Ihnen helfen?", it: "Buongiorno! Posso aiutarla?", pt: "Oi! Posso ajudar?" },
            { who: "you", en: "Yes, do you have this shirt in a medium?", es: "Sí, ¿tiene esta camisa en la talla M?", fr: "Oui, vous avez cette chemise en M ?", de: "Ja, haben Sie dieses Hemd in M?", it: "Sì, ha questa camicia nella taglia M?", pt: "Sim, tem essa camisa no tamanho M?" },
            { who: "them", en: "Let me check... Here you go.", es: "Déjeme mirar... Aquí tiene.", fr: "Je vais voir... Voilà.", de: "Ich schaue mal nach... Bitte schön.", it: "Controllo subito... Ecco qua.", pt: "Vou ver... Aqui está." },
            { who: "you", en: "Thanks. Where are the fitting rooms?", es: "Gracias. ¿Dónde están los probadores?", fr: "Merci. Où sont les cabines d'essayage ?", de: "Danke. Wo sind die Umkleidekabinen?", it: "Grazie. Dove sono i camerini?", pt: "Obrigado. Onde ficam os provadores?" },
            { who: "them", en: "At the back, on the left.", es: "Al fondo, a la izquierda.", fr: "Au fond, à gauche.", de: "Hinten links.", it: "In fondo a sinistra.", pt: "Lá no fundo, à esquerda." },
            { who: "you", en: "It fits well. I'll take it!", es: "Me queda bien. ¡Me la llevo!", fr: "Elle me va bien. Je la prends !", de: "Das passt gut. Ich nehme es!", it: "Mi sta bene. La prendo!", pt: "Ficou bom. Vou levar!" }
        ],
        tips: {
            es: "\"Me queda…\" is how Spanish talks about fit: \"me queda grande\" (it's big on me), \"me queda bien\" (it fits). Clothing sizes are \"tallas\"; for shoes, ask for your \"número\".",
            fr: "\"Ça me va\" means it fits or suits you. In France, the big sales (\"les soldes\") happen at fixed times, usually in January and early summer.",
            de: "\"Anprobieren\" means to try on. Prices in German shops are fixed, so haggling isn't expected, but \"reduziert\" or \"Sale\" signs mean a discount.",
            it: "\"Mi sta bene\" means it fits or suits you. Italian clothing sizes use different numbers from the US and UK, so it's worth asking \"Che taglia è?\" (what size is it?).",
            pt: "Brazilians often say \"ficou bom\" (it looks good, it fits) after trying something on. \"Provador\" is the fitting room, and many shops let you pay in installments (\"parcelado\")."
        }
    },
    {
        slug: "book-a-table",
        title: "book a table",
        icon: "📞",
        topic: "phoning a restaurant to book a table for dinner",
        topicTitle: "Book a table",
        intro: "Booking a table means a phone call, which is the scariest kind of conversation because you can't point at anything. These phrases cover the whole call, from the greeting to spelling your name.",
        phrases: [
            { en: "I'd like to book a table.", es: "Quisiera reservar una mesa.", fr: "Je voudrais réserver une table.", de: "Ich möchte einen Tisch reservieren.", it: "Vorrei prenotare un tavolo.", pt: "Eu gostaria de reservar uma mesa." },
            { en: "For four people", es: "Para cuatro personas", fr: "Pour quatre personnes", de: "Für vier Personen", it: "Per quattro persone", pt: "Para quatro pessoas" },
            { en: "Tonight at eight", es: "Esta noche a las ocho", fr: "Ce soir à vingt heures", de: "Heute Abend um acht", it: "Stasera alle otto", pt: "Hoje à noite, às oito" },
            { en: "Do you have a table outside?", es: "¿Tienen mesa en la terraza?", fr: "Vous avez une table en terrasse ?", de: "Haben Sie einen Tisch draußen?", it: "Avete un tavolo all'aperto?", pt: "Vocês têm mesa do lado de fora?" },
            { en: "Under the name…", es: "A nombre de…", fr: "Au nom de…", de: "Auf den Namen…", it: "A nome di…", pt: "No nome de…" },
            { en: "Is there anything later?", es: "¿Hay algo más tarde?", fr: "Vous avez quelque chose plus tard ?", de: "Geht es auch später?", it: "C'è qualcosa più tardi?", pt: "Tem algum horário mais tarde?" },
            { en: "We're fully booked.", es: "Estamos completos.", fr: "Nous sommes complets.", de: "Wir sind leider ausgebucht.", it: "Siamo al completo.", pt: "Estamos lotados." },
            { en: "Can you spell that?", es: "¿Me lo puede deletrear?", fr: "Vous pouvez l'épeler ?", de: "Können Sie das buchstabieren?", it: "Può dirmelo lettera per lettera?", pt: "Pode soletrar?" },
            { en: "I need to cancel my reservation.", es: "Tengo que cancelar mi reserva.", fr: "Je dois annuler ma réservation.", de: "Ich muss meine Reservierung stornieren.", it: "Devo disdire la mia prenotazione.", pt: "Preciso cancelar minha reserva." },
            { en: "See you tonight!", es: "¡Hasta esta noche!", fr: "À ce soir !", de: "Bis heute Abend!", it: "A stasera!", pt: "Até hoje à noite!" }
        ],
        roles: { them: "Restaurant", you: "You" },
        dialogue: [
            { who: "them", en: "Hello, La Piazza restaurant.", es: "Restaurante La Piazza, ¿dígame?", fr: "Bonjour, restaurant La Piazza.", de: "Restaurant La Piazza, guten Tag.", it: "Pronto, ristorante La Piazza.", pt: "Alô, restaurante La Piazza." },
            { who: "you", en: "Hello, I'd like to book a table for four tonight.", es: "Hola, quisiera reservar una mesa para cuatro para esta noche.", fr: "Bonjour, je voudrais réserver une table pour quatre ce soir.", de: "Hallo, ich möchte für heute Abend einen Tisch für vier Personen reservieren.", it: "Buongiorno, vorrei prenotare un tavolo per quattro per stasera.", pt: "Oi, eu gostaria de reservar uma mesa para quatro hoje à noite." },
            { who: "them", en: "What time?", es: "¿A qué hora?", fr: "Pour quelle heure ?", de: "Um wie viel Uhr?", it: "A che ora?", pt: "Para que horas?" },
            { who: "you", en: "At eight, if possible.", es: "A las ocho, si es posible.", fr: "À vingt heures, si possible.", de: "Um acht, wenn möglich.", it: "Alle otto, se possibile.", pt: "Às oito, se possível." },
            { who: "them", en: "Perfect. Under what name?", es: "Perfecto. ¿A nombre de quién?", fr: "Parfait. À quel nom ?", de: "In Ordnung. Auf welchen Namen?", it: "Perfetto. A che nome?", pt: "Perfeito. Em nome de quem?" },
            { who: "you", en: "Under the name Taylor. See you tonight!", es: "A nombre de Taylor. ¡Hasta esta noche!", fr: "Au nom de Taylor. À ce soir !", de: "Auf den Namen Taylor. Bis heute Abend!", it: "A nome Taylor. A stasera!", pt: "No nome de Taylor. Até hoje à noite!" }
        ],
        tips: {
            es: "Spaniards eat late: dinner bookings at 21:00 or 22:00 are normal, and many kitchens don't open before 20:30. \"¿Dígame?\" is a common way to answer the phone.",
            fr: "French uses the 24-hour clock for bookings, so 8 pm is \"vingt heures\". Popular restaurants fill up fast, so booking a day ahead is wise.",
            de: "\"Ausgebucht\" means fully booked. Germans expect punctuality, and a table is often held for only about 15 minutes.",
            it: "Italians answer the phone with \"Pronto?\". Dinner usually starts around 20:00 or later, and a \"coperto\" (cover charge) per person on the bill is normal.",
            pt: "In Brazil, \"Alô?\" is how you answer the phone. Many popular restaurants don't take bookings at all, so it's worth asking \"Vocês fazem reserva?\" (do you take reservations?)."
        }
    },
    {
        slug: "at-the-pharmacy",
        title: "ask for help at a pharmacy",
        icon: "💊",
        topic: "asking a pharmacist for something for a cold and a headache",
        topicTitle: "At the pharmacy",
        intro: "Feeling under the weather abroad is no fun, but pharmacists are some of the most helpful people you'll meet. These phrases help you explain what's wrong and understand how to take what they give you.",
        phrases: [
            { en: "I need something for a headache.", es: "Necesito algo para el dolor de cabeza.", fr: "J'ai besoin de quelque chose contre le mal de tête.", de: "Ich brauche etwas gegen Kopfschmerzen.", it: "Ho bisogno di qualcosa per il mal di testa.", pt: "Preciso de alguma coisa para dor de cabeça." },
            { en: "I have a cold.", es: "Estoy resfriado.", fr: "J'ai un rhume.", de: "Ich bin erkältet.", it: "Ho il raffreddore.", pt: "Estou resfriado." },
            { en: "I have a cough.", es: "Tengo tos.", fr: "Je tousse.", de: "Ich habe Husten.", it: "Ho la tosse.", pt: "Estou com tosse." },
            { en: "Something for a sore throat", es: "Algo para el dolor de garganta", fr: "Quelque chose pour le mal de gorge", de: "Etwas gegen Halsschmerzen", it: "Qualcosa per il mal di gola", pt: "Alguma coisa para dor de garganta" },
            { en: "Do I need a prescription for this?", es: "¿Hace falta receta para esto?", fr: "Il faut une ordonnance pour ça ?", de: "Ist das verschreibungspflichtig?", it: "Ci vuole la ricetta per questo?", pt: "Precisa de receita para isso?" },
            { en: "How many times a day?", es: "¿Cuántas veces al día?", fr: "Combien de fois par jour ?", de: "Wie oft am Tag?", it: "Quante volte al giorno?", pt: "Quantas vezes por dia?" },
            { en: "Before or after meals?", es: "¿Antes o después de las comidas?", fr: "Avant ou après les repas ?", de: "Vor oder nach dem Essen?", it: "Prima o dopo i pasti?", pt: "Antes ou depois das refeições?" },
            { en: "Does it make you drowsy?", es: "¿Da sueño?", fr: "Ça fait dormir ?", de: "Macht das müde?", it: "Fa venire sonno?", pt: "Dá sono?" },
            { en: "Sunscreen", es: "Protector solar", fr: "De la crème solaire", de: "Sonnencreme", it: "Crema solare", pt: "Protetor solar" },
            { en: "Where is the nearest pharmacy?", es: "¿Dónde está la farmacia más cercana?", fr: "Où est la pharmacie la plus proche ?", de: "Wo ist die nächste Apotheke?", it: "Dov'è la farmacia più vicina?", pt: "Onde fica a farmácia mais próxima?" }
        ],
        roles: { them: "Pharmacist", you: "You" },
        dialogue: [
            { who: "them", en: "Hello, what can I do for you?", es: "Hola, ¿en qué le puedo ayudar?", fr: "Bonjour, qu'est-ce que je peux faire pour vous ?", de: "Guten Tag, was kann ich für Sie tun?", it: "Buongiorno, cosa posso fare per lei?", pt: "Oi, em que posso ajudar?" },
            { who: "you", en: "I have a cold and a bad headache.", es: "Estoy resfriado y me duele mucho la cabeza.", fr: "J'ai un rhume et très mal à la tête.", de: "Ich bin erkältet und habe starke Kopfschmerzen.", it: "Ho il raffreddore e un forte mal di testa.", pt: "Estou resfriado e com muita dor de cabeça." },
            { who: "them", en: "Are you allergic to any medication?", es: "¿Tiene alergia a algún medicamento?", fr: "Vous êtes allergique à des médicaments ?", de: "Haben Sie Allergien gegen Medikamente?", it: "È allergico a qualche farmaco?", pt: "Tem alergia a algum remédio?" },
            { who: "you", en: "No, none.", es: "No, a ninguno.", fr: "Non, aucun.", de: "Nein, keine.", it: "No, a nessuno.", pt: "Não, a nenhum." },
            { who: "them", en: "Take one of these every eight hours, after meals.", es: "Tómese una de estas cada ocho horas, después de las comidas.", fr: "Prenez-en un toutes les huit heures, après les repas.", de: "Nehmen Sie alle acht Stunden eine davon, nach dem Essen.", it: "Ne prenda una ogni otto ore, dopo i pasti.", pt: "Tome um a cada oito horas, depois das refeições." },
            { who: "you", en: "Great, thank you very much.", es: "Muy bien, muchas gracias.", fr: "Très bien, merci beaucoup.", de: "Gut, vielen Dank.", it: "Va bene, grazie mille.", pt: "Ótimo, muito obrigado." }
        ],
        tips: {
            es: "Spanish pharmacies have a green cross, and one in each area stays open late (the \"farmacia de guardia\"). \"Estoy resfriado/a\" means you have a cold, not that you feel cold.",
            fr: "Look for the green cross. French pharmacists give real advice, so describing your symptoms is normal. The \"pharmacie de garde\" is the one open at night and on Sundays.",
            de: "In Germany, medicine (even basic painkillers) is sold only in an \"Apotheke\", not in supermarkets. A \"Drogerie\" sells toiletries and cosmetics, not medicine.",
            it: "Italian pharmacies have a green cross, and most medicines, even simple ones, are only sold there. The \"farmacia di turno\" is the one open at night or on holidays.",
            pt: "Brazilian \"farmácias\" sell a lot more than medicine, and many are open 24 hours. \"Remédio\" is the everyday word for medicine."
        }
    },
    {
        slug: "make-small-talk",
        title: "make small talk",
        icon: "🌤️",
        topic: "making small talk with a neighbour about the weather and weekend plans",
        topicTitle: "Small talk",
        intro: "Small talk is where real fluency shows: no script, no menu, just a friendly chat. These phrases (in the casual \"you\" you'd use with a friendly neighbour) get you through the weather, the weekend and a warm goodbye.",
        phrases: [
            { en: "How's it going?", es: "¿Qué tal?", fr: "Ça va ?", de: "Wie geht's?", it: "Come va?", pt: "Tudo bem?" },
            { en: "Nice weather today, isn't it?", es: "Hace buen tiempo hoy, ¿verdad?", fr: "Il fait beau aujourd'hui, hein ?", de: "Schönes Wetter heute, oder?", it: "Che bella giornata oggi, vero?", pt: "Que dia bonito hoje, né?" },
            { en: "It's so hot / so cold!", es: "¡Qué calor / qué frío!", fr: "Il fait tellement chaud / froid !", de: "Ist das heiß / kalt heute!", it: "Che caldo / che freddo!", pt: "Que calor / que frio!" },
            { en: "Any plans for the weekend?", es: "¿Tienes planes para el fin de semana?", fr: "Tu as des projets pour le week-end ?", de: "Hast du was vor am Wochenende?", it: "Hai programmi per il fine settimana?", pt: "Tem planos para o fim de semana?" },
            { en: "Not much, just relaxing.", es: "Nada especial, descansar.", fr: "Pas grand-chose, je vais me reposer.", de: "Nicht viel, einfach entspannen.", it: "Niente di speciale, mi riposo.", pt: "Nada de mais, só descansar." },
            { en: "How was your weekend?", es: "¿Qué tal el fin de semana?", fr: "Tu as passé un bon week-end ?", de: "Wie war dein Wochenende?", it: "Com'è andato il fine settimana?", pt: "Como foi o fim de semana?" },
            { en: "How long have you lived here?", es: "¿Cuánto tiempo llevas viviendo aquí?", fr: "Tu habites ici depuis combien de temps ?", de: "Wie lange wohnst du schon hier?", it: "Da quanto tempo abiti qui?", pt: "Faz quanto tempo que você mora aqui?" },
            { en: "What do you do for work?", es: "¿A qué te dedicas?", fr: "Tu fais quoi dans la vie ?", de: "Was machst du beruflich?", it: "Che lavoro fai?", pt: "Você trabalha com o quê?" },
            { en: "Nice talking to you!", es: "¡Encantado de charlar contigo!", fr: "Ça m'a fait plaisir de discuter !", de: "Schön, mit dir zu plaudern!", it: "È stato un piacere chiacchierare!", pt: "Foi bom conversar com você!" },
            { en: "See you around!", es: "¡Nos vemos!", fr: "À la prochaine !", de: "Bis bald!", it: "Ci vediamo!", pt: "A gente se vê!" }
        ],
        roles: { them: "Neighbour", you: "You" },
        dialogue: [
            { who: "them", en: "Hi! How's it going?", es: "¡Hola! ¿Qué tal?", fr: "Salut ! Ça va ?", de: "Hallo! Wie geht's?", it: "Ciao! Come va?", pt: "Oi! Tudo bem?" },
            { who: "you", en: "Good, thanks! Nice weather today, isn't it?", es: "¡Bien, gracias! Hace buen tiempo hoy, ¿verdad?", fr: "Ça va, merci ! Il fait beau aujourd'hui, hein ?", de: "Gut, danke! Schönes Wetter heute, oder?", it: "Bene, grazie! Che bella giornata oggi, vero?", pt: "Tudo ótimo, obrigado! Que dia bonito hoje, né?" },
            { who: "them", en: "Finally! Any plans for the weekend?", es: "¡Por fin! ¿Tienes planes para el fin de semana?", fr: "Enfin ! Tu as des projets pour le week-end ?", de: "Endlich! Hast du was vor am Wochenende?", it: "Finalmente! Hai programmi per il fine settimana?", pt: "Até que enfim! Tem planos para o fim de semana?" },
            { who: "you", en: "I'm going to the beach with some friends. And you?", es: "Voy a la playa con unos amigos. ¿Y tú?", fr: "Je vais à la plage avec des amis. Et toi ?", de: "Ich fahre mit Freunden an den Strand. Und du?", it: "Vado al mare con degli amici. E tu?", pt: "Vou à praia com uns amigos. E você?" },
            { who: "them", en: "Nothing special, just relaxing at home.", es: "Nada especial, descansar en casa.", fr: "Rien de spécial, je vais me reposer à la maison.", de: "Nichts Besonderes, einfach zu Hause entspannen.", it: "Niente di speciale, mi riposo a casa.", pt: "Nada de mais, só descansar em casa." },
            { who: "you", en: "Sounds good! See you around!", es: "¡Suena bien! ¡Nos vemos!", fr: "Bonne idée ! À la prochaine !", de: "Klingt gut! Bis bald!", it: "Ottima idea! Ci vediamo!", pt: "Boa! A gente se vê!" }
        ],
        tips: {
            es: "Spanish small talk is warm and quick to use \"tú\". \"¿Qué tal?\" works for almost everything: \"¿Qué tal el trabajo?\" (how's work?), \"¿Qué tal las vacaciones?\" (how was the holiday?).",
            fr: "These phrases use the friendly \"tu\". With an older neighbour or someone you've just met, switch to \"vous\": \"Vous avez des projets pour le week-end ?\".",
            de: "These phrases use the friendly \"du\". With older neighbours or in formal settings, use \"Sie\": \"Wie geht es Ihnen?\" The weather is a safe topic everywhere.",
            it: "\"Come va?\" and \"Che bella giornata!\" are perfect openers. Italians often add \"dai\" for warmth, as in \"Dai, ci vediamo!\" (come on, see you soon!).",
            pt: "\"Né?\" (short for \"não é?\") is the Brazilian \"isn't it?\" and you'll hear it constantly. \"Tudo bem?\" is both the question and the answer: \"Tudo!\""
        }
    }

];

module.exports = { LANGUAGES, SITUATIONS };
