// Builds the phrase-guide pages under /learn/ from phrase-guides.data.js,
// and rewrites sitemap.xml to include them.
//
// Run from the project folder after editing the data file:
//   node tools/build-phrase-guides.js
// The generated HTML is committed, so Render just serves it as static files.

const fs = require("fs");
const path = require("path");
const { LANGUAGES, SITUATIONS } = require("./phrase-guides.data.js");

const SITE = (process.env.SITE_URL || "https://echoly-enjr.onrender.com").replace(/\/+$/, "");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "learn");

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const titleCase = s => s.split(" ").map(w => (["a", "at", "to", "in", "into", "for", "the"].includes(w) ? w : cap(w))).join(" ");
const fillLang = (s, lang) => s.replace(/\{lang\}/g, lang.name);

const LOGO = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 5.5C3 4.12 4.12 3 5.5 3h13A2.5 2.5 0 0121 5.5v9A2.5 2.5 0 0118.5 17H10l-4.5 4v-4h-.5A2.5 2.5 0 013 14.5v-9z" fill="#e85d4c"/><circle cx="8.2" cy="10" r="1.3" fill="#fff"/><circle cx="12" cy="10" r="1.3" fill="#fff"/><circle cx="15.8" cy="10" r="1.3" fill="#fff"/></svg>`;

const GA = `<script>
  var GA_MEASUREMENT_ID = "G-73FZYLJWPT";
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  var gaScriptEl = document.createElement("script");
  gaScriptEl.async = true;
  gaScriptEl.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
  document.head.appendChild(gaScriptEl);
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
</script>`;

function shell({ title, description, canonical, body, jsonLd, lang }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#e85d4c">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
${GA}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/learn/guide.css">
</head>
<body${lang ? ` data-locale="${lang.locale}"` : ""}>
<header class="nav"><div class="wrap nav-inner">
  <a class="logo" href="/">${LOGO} Echoly</a>
  <a class="nav-link" href="/learn/">Phrase guides</a>
  <a class="btn btn-primary btn-small" href="/app.html?utm_source=guide&utm_medium=nav">Try it free</a>
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap foot">
  <a class="logo" href="/" style="font-size:17px">${LOGO} Echoly</a>
  <a href="/learn/">Phrase guides</a><a href="/privacy.html">Privacy</a><a href="/tos.html">Terms</a>
</div></footer>
<script>
(function () {
  // "Listen" buttons: read the phrase aloud with the browser's built-in voice.
  var locale = document.body.getAttribute("data-locale");
  var btns = document.querySelectorAll("[data-say]");
  if (!locale || !("speechSynthesis" in window)) { btns.forEach(function (b) { b.remove(); }); return; }
  btns.forEach(function (b) {
    b.addEventListener("click", function () {
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(b.getAttribute("data-say"));
        u.lang = locale; u.rate = 0.9;
        speechSynthesis.speak(u);
      } catch (e) {}
    });
  });
})();
document.addEventListener("click", function (e) {
  var a = e.target.closest("a[data-cta]");
  if (a && window.gtag) gtag("event", "guide_cta_click", { cta: a.getAttribute("data-cta") });
});
</script>
</body>
</html>
`;
}

function practiceUrl(lang, sit, medium) {
    const p = new URLSearchParams({ lang: lang.app, topic: sit.topic, title: sit.topicTitle, utm_source: "guide", utm_medium: medium });
    return `/app.html?${p.toString()}`;
}

function guidePage(lang, sit) {
    const h1 = `How to ${sit.title} in ${lang.name}`;
    const title = `How to ${titleCase(sit.title)} in ${lang.name}: ${sit.phrases.length} Phrases + Example Conversation | Echoly`;
    const description = `The ${lang.name} phrases you need to ${sit.title}, with English translations, audio, a sample conversation and a free way to practice it out loud.`;
    const canonical = `${SITE}/learn/${lang.slug}/${sit.slug}.html`;

    const rows = sit.phrases.map(p => `
        <tr>
          <td class="tgt">${esc(p[lang.key])}</td>
          <td class="en">${esc(fillLang(p.en, lang))}</td>
          <td class="say"><button type="button" class="say-btn" data-say="${esc(p[lang.key].replace(/\s*\/\s*/g, ", "))}" aria-label="Listen">🔊</button></td>
        </tr>`).join("");

    const lines = sit.dialogue.map(d => {
        const en = fillLang((d.enBy && d.enBy[lang.key]) || d.en, lang);
        const who = sit.roles[d.who];
        return `
        <div class="line line-${d.who}">
          <span class="who">${esc(who)}</span>
          <div class="bubble">
            <span class="tgt">${esc(d[lang.key])}</span>
            <button type="button" class="say-btn" data-say="${esc(d[lang.key])}" aria-label="Listen">🔊</button>
            <span class="en">${esc(en)}</span>
          </div>
        </div>`;
    }).join("");

    const otherSits = SITUATIONS.filter(s => s.slug !== sit.slug)
        .map(s => `<a class="chip" href="/learn/${lang.slug}/${s.slug}.html">${s.icon} How to ${esc(s.title)}</a>`).join("");
    const otherLangs = LANGUAGES.filter(l => l.key !== lang.key)
        .map(l => `<a class="chip" href="/learn/${l.slug}/${sit.slug}.html">${esc(l.name)}</a>`).join("");

    const body = `
<nav class="crumbs"><a href="/learn/">Phrase guides</a> › <a href="/learn/${lang.slug}/">${esc(lang.name)}</a> › ${esc(cap(sit.title))}</nav>
<article>
  <p class="eyebrow">${sit.icon} ${esc(lang.name)} phrase guide${lang.note ? ` · ${esc(lang.note)}` : ""}</p>
  <h1>${esc(h1)}</h1>
  <p class="lead">${esc(sit.intro)}</p>

  <a class="cta-inline" data-cta="top" href="${practiceUrl(lang, sit, "top")}">Practice this conversation out loud, free →</a>

  <h2>Key ${esc(lang.name)} phrases</h2>
  <table class="phrases">
    <thead><tr><th>${esc(lang.name)}</th><th>English</th><th class="say"><span class="sr">Listen</span></th></tr></thead>
    <tbody>${rows}
    </tbody>
  </table>

  <h2>Example conversation</h2>
  <div class="dialogue">${lines}
  </div>

  <h2>Good to know</h2>
  <p class="tip">💡 ${esc(sit.tips[lang.key])}</p>

  <section class="cta-card">
    <h2>Reading phrases isn't the same as saying them.</h2>
    <p>Have this conversation with an AI partner who plays the other person, answers back, gives you a tip when something sounds off, and lets you speak your replies out loud. Free, no signup needed.</p>
    <a class="btn btn-primary" data-cta="card" href="${practiceUrl(lang, sit, "card")}">Practice "${esc(sit.topicTitle)}" in ${esc(lang.name)} →</a>
  </section>

  <h2>More ${esc(lang.name)} situations</h2>
  <div class="chips">${otherSits}</div>
  <h2>This guide in other languages</h2>
  <div class="chips">${otherLangs}</div>
</article>`;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Phrase guides", item: `${SITE}/learn/` },
            { "@type": "ListItem", position: 2, name: lang.name, item: `${SITE}/learn/${lang.slug}/` },
            { "@type": "ListItem", position: 3, name: cap(sit.title), item: canonical }
        ]
    };
    return shell({ title, description, canonical, body, jsonLd, lang });
}

function languageIndex(lang) {
    const canonical = `${SITE}/learn/${lang.slug}/`;
    const cards = SITUATIONS.map(s => `
    <a class="card" href="/learn/${lang.slug}/${s.slug}.html">
      <span class="card-icon">${s.icon}</span>
      <b>How to ${esc(s.title)} in ${esc(lang.name)}</b>
      <span>${s.phrases.length} phrases, audio and an example conversation</span>
    </a>`).join("");
    const body = `
<nav class="crumbs"><a href="/learn/">Phrase guides</a> › ${esc(lang.name)}</nav>
<p class="eyebrow">${esc(lang.name)} phrase guides${lang.note ? ` · ${esc(lang.note)}` : ""}</p>
<h1>Everyday ${esc(lang.name)} phrases for real situations</h1>
<p class="lead">Pick a situation, learn the phrases, then practice the whole conversation out loud with an AI partner.</p>
<div class="cards">${cards}
</div>
<section class="cta-card">
  <h2>Got a situation that isn't here?</h2>
  <p>Describe anything, like calling your landlord or meeting your partner's parents, and rehearse it in ${esc(lang.name)}.</p>
  <a class="btn btn-primary" data-cta="lang-index" href="/app.html?lang=${encodeURIComponent(lang.app)}&utm_source=guide&utm_medium=lang-index">Start practicing ${esc(lang.name)} free →</a>
</section>`;
    return shell({
        title: `${lang.name} Phrases for Everyday Situations | Echoly`,
        description: `Learn the ${lang.name} phrases for ordering coffee, restaurants, directions, hotels, introductions and doctor's appointments, with audio and example conversations.`,
        canonical, body, lang
    });
}

function rootIndex() {
    const canonical = `${SITE}/learn/`;
    const blocks = LANGUAGES.map(l => `
  <section class="lang-block">
    <h2><a href="/learn/${l.slug}/">${esc(l.name)}</a>${l.note ? ` <small>${esc(l.note)}</small>` : ""}</h2>
    <div class="chips">${SITUATIONS.map(s => `<a class="chip" href="/learn/${l.slug}/${s.slug}.html">${s.icon} ${esc(cap(s.title))}</a>`).join("")}</div>
  </section>`).join("");
    const body = `
<p class="eyebrow">Free phrase guides</p>
<h1>The phrases you'll actually use, in 5 languages</h1>
<p class="lead">Short guides for the conversations you'll really have, each with audio, an example conversation and a one-tap way to practice it out loud.</p>
${blocks}
<section class="cta-card">
  <h2>Practice any of these out loud</h2>
  <p>Echoly lets you have the whole conversation with an AI partner in 20 languages. Free, no signup needed.</p>
  <a class="btn btn-primary" data-cta="root-index" href="/app.html?utm_source=guide&utm_medium=root-index">Start a free conversation →</a>
</section>`;
    return shell({
        title: "Free Phrase Guides for Real-Life Conversations | Echoly",
        description: "Free phrase guides in Spanish, French, German, Italian and Portuguese: ordering coffee, restaurants, directions, hotels, introductions and doctor's appointments.",
        canonical, body
    });
}

const CSS = `:root{--bg:#fbf7f2;--bg-deep:#f4ece3;--surface:#fff;--ink:#221825;--ink-soft:#6b5f6e;--border:#eae1e6;--accent:#e85d4c;--accent-dark:#c9473a;--accent-soft:#fdeae6;--tip:#a8710a;--tip-bg:#fff6e5;--tip-border:#f5dfa6;--plum:#322234}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:780px;margin:0 auto;padding:0 20px}
h1,h2{font-family:'Bricolage Grotesque','Inter',sans-serif;letter-spacing:-.02em;line-height:1.15}
h1{font-size:clamp(30px,5.5vw,44px);margin:6px 0 14px;font-weight:800}
h2{font-size:23px;margin:40px 0 14px;font-weight:800}
h2 small{font-family:'Inter',sans-serif;font-size:13px;color:var(--ink-soft);font-weight:600;letter-spacing:0}
.nav{border-bottom:1px solid var(--border);background:rgba(251,247,242,.92);position:sticky;top:0;z-index:10;backdrop-filter:blur(8px)}
.nav-inner{display:flex;align-items:center;gap:18px;height:60px;max-width:1000px}
.logo{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:20px}
.nav-link{margin-left:auto;text-decoration:none;font-weight:600;font-size:14px;color:var(--ink-soft)}
.nav-link:hover{color:var(--ink)}
.btn{display:inline-block;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 20px;font-size:15px}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent-dark)}
.btn-small{padding:8px 14px;font-size:14px;border-radius:10px}
.crumbs{font-size:13px;color:var(--ink-soft);margin:22px 0 18px}
.crumbs a{text-decoration:none}.crumbs a:hover{text-decoration:underline}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:0}
.lead{font-size:18px;color:var(--ink-soft);margin:0 0 18px}
.cta-inline{display:inline-block;font-weight:700;color:var(--accent);text-decoration:none;border-bottom:2px solid var(--accent-soft)}
.cta-inline:hover{border-color:var(--accent)}
.phrases{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.phrases th{text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);padding:11px 14px;background:var(--bg-deep)}
.phrases td{padding:11px 14px;border-top:1px solid var(--border);vertical-align:top}
.phrases td.tgt{font-weight:700;width:52%}
.phrases td.en{color:var(--ink-soft)}
.phrases .say{width:44px;text-align:right}
.say-btn{background:var(--accent-soft);border:none;border-radius:8px;cursor:pointer;font-size:14px;padding:4px 7px;line-height:1}
.say-btn:hover{background:#fbd6cf}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.dialogue{display:flex;flex-direction:column;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px}
.line{display:flex;flex-direction:column;max-width:84%}
.line-you{align-self:flex-end;align-items:flex-end}
.who{font-size:11.5px;font-weight:700;color:var(--ink-soft);margin:0 6px 3px}
.bubble{padding:10px 14px;border-radius:16px;background:var(--bg-deep)}
.line-you .bubble{background:var(--accent);color:#fff}
.line-you .say-btn{background:rgba(255,255,255,.22)}
.bubble .tgt{font-weight:600}
.bubble .say-btn{margin-left:6px;font-size:12px;vertical-align:1px}
.bubble .en{display:block;font-size:13px;opacity:.75;font-style:italic;margin-top:2px}
.tip{background:var(--tip-bg);border:1px solid var(--tip-border);color:#7d5307;border-radius:12px;padding:14px 16px;margin:0}
.cta-card{background:var(--plum);color:#f7f1ec;border-radius:20px;padding:28px 24px;margin:44px 0 10px}
.cta-card h2{margin:0 0 8px;color:#fff}
.cta-card p{color:rgba(247,241,236,.78);margin:0 0 18px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{text-decoration:none;background:var(--surface);border:1.5px solid var(--border);border-radius:999px;padding:7px 13px;font-size:14px;font-weight:600}
.chip:hover{border-color:var(--accent)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:10px}
.card{display:flex;flex-direction:column;gap:4px;text-decoration:none;background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:18px}
.card:hover{border-color:var(--accent)}
.card-icon{font-size:24px}.card span:last-child{font-size:13px;color:var(--ink-soft)}
.lang-block h2 a{text-decoration:none}.lang-block h2 a:hover{color:var(--accent)}
footer{border-top:1px solid var(--border);margin-top:56px;padding:28px 0 40px;font-size:14px;color:var(--ink-soft)}
.foot{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.foot a{text-decoration:none}.foot a:hover{text-decoration:underline}
@media (max-width:560px){.phrases td.tgt{width:auto}.phrases th,.phrases td{padding:10px}.line{max-width:94%}}
`;

function write(rel, content) {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

// Sanity check: every phrase and line needs every language filled in.
for (const sit of SITUATIONS) {
    for (const row of [...sit.phrases, ...sit.dialogue]) {
        for (const l of LANGUAGES) {
            if (!row[l.key]) throw new Error(`Missing ${l.key} in "${sit.slug}": ${row.en}`);
        }
    }
    for (const l of LANGUAGES) if (!sit.tips[l.key]) throw new Error(`Missing ${l.key} tip in "${sit.slug}"`);
}

write("learn/guide.css", CSS);
write("learn/index.html", rootIndex());
const urls = [`${SITE}/learn/`];
for (const lang of LANGUAGES) {
    write(`learn/${lang.slug}/index.html`, languageIndex(lang));
    urls.push(`${SITE}/learn/${lang.slug}/`);
    for (const sit of SITUATIONS) {
        write(`learn/${lang.slug}/${sit.slug}.html`, guidePage(lang, sit));
        urls.push(`${SITE}/learn/${lang.slug}/${sit.slug}.html`);
    }
}

const sitemapEntries = [
    { loc: `${SITE}/`, freq: "weekly", pri: "1.0" },
    ...urls.map(u => ({ loc: u, freq: "monthly", pri: u.endsWith("/learn/") ? "0.8" : "0.7" })),
    { loc: `${SITE}/privacy.html`, freq: "monthly", pri: "0.3" },
    { loc: `${SITE}/tos.html`, freq: "monthly", pri: "0.3" }
];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map(e => `  <url>\n    <loc>${e.loc}</loc>\n    <changefreq>${e.freq}</changefreq>\n    <priority>${e.pri}</priority>\n  </url>`).join("\n")}
</urlset>
`);

console.log(`Built ${urls.length} pages under /learn/ and updated sitemap.xml.`);
