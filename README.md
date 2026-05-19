# Voice Translator

A simple web app that lets you type text in English, translate it into another language, hear the translation read aloud, and see a map of the region where that language is spoken.

## Features

- **Text input** — Type or paste any sentence to translate
- **Language picker** — Choose from 20 languages
- **Translation** — Powered by the free MyMemory Translation API
- **Read aloud** — Uses your browser’s built-in text-to-speech (Web Speech API)
- **Synced map** — Leaflet map updates when you change language or translate, centered on the country associated with that language

## Run locally

Because the app loads map tiles and calls a translation API, you need a local server (opening `index.html` directly may block fetch requests).

```bash
# From the project folder
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

Or with Node:

```bash
npx serve .
```

## Usage

1. Enter text in the text area (English source).
2. Select a target language from the dropdown — the map moves immediately.
3. Click **Translate** (or press Cmd/Ctrl + Enter).
4. The translation appears and is read aloud automatically.
5. Use **Read aloud** to hear it again, or **Stop** to cancel speech.

## Notes

- Translation quality depends on the MyMemory API (free tier, rate limits may apply).
- Text-to-speech voices vary by browser and operating system; some languages may use a fallback voice.
- The map shows a representative country for each language (e.g. Spanish → Spain, Japanese → Japan).
