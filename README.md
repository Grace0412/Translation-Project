# GlobeSpeak — Online Voice Translator Website

A static website you open in any browser. Type text in English, choose a language, hear the translation spoken aloud, and view an interactive map of where that language is spoken.

## What's on the site

- **Home hero** — Introduction and link to the translator
- **Translator** — Text input, language selector, and read-aloud playback
- **Language map** — Updates when you change language or translate
- **How it works** — Quick overview for visitors

## View the website locally

The site loads map tiles and calls a translation API, so use a simple local web server rather than opening the HTML file directly:

```bash
cd "/Users/grace/Desktop/Vibe Code/Translation-Project"
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

## Publish online

This is a plain static site — upload the project folder to any static host:

- [GitHub Pages](https://pages.github.com/)
- [Netlify](https://www.netlify.com/)
- [Vercel](https://vercel.com/)

No build step required. Deploy `index.html`, `css/`, and `js/` as-is.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Website pages and structure |
| `css/styles.css` | Layout and styling |
| `js/languages.js` | Language list and map coordinates |
| `js/main.js` | Translation, speech, and map logic |
