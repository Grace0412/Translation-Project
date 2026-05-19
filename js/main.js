const sourceText = document.getElementById("source-text");
const targetLang = document.getElementById("target-lang");
const translateBtn = document.getElementById("translate-btn");
const statusEl = document.getElementById("status");
const resultBlock = document.getElementById("result-block");
const translatedText = document.getElementById("translated-text");
const speakBtn = document.getElementById("speak-btn");
const stopSpeakBtn = document.getElementById("stop-speak-btn");
const mapTitle = document.getElementById("map-title");
const mapSubtitle = document.getElementById("map-subtitle");
const yearEl = document.getElementById("year");

let map;
let marker;
let currentTranslation = "";
let currentLanguage = getLanguageByCode("es");

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

function populateLanguageSelect() {
  LANGUAGES.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    targetLang.appendChild(option);
  });
  targetLang.value = "es";
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` ${type}` : ""}`;
}

function initMap() {
  map = L.map("map", {
    scrollWheelZoom: true,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  syncMapToLanguage(currentLanguage);
}

function syncMapToLanguage(lang) {
  currentLanguage = lang;

  mapTitle.textContent = `${lang.name} — ${lang.country}`;
  mapSubtitle.textContent = `Showing ${lang.country}, where ${lang.name} is widely spoken.`;

  const center = [lang.lat, lang.lng];

  if (marker) {
    marker.setLatLng(center);
  } else {
    marker = L.marker(center).addTo(map);
  }

  marker.bindPopup(`<strong>${lang.country}</strong><br>${lang.name}`).openPopup();

  map.setView(center, lang.zoom, { animate: true });
}

async function translateText(text, targetCode) {
  const encoded = encodeURIComponent(text.trim());
  const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|${targetCode}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Translation service unavailable. Try again in a moment.");
  }

  const data = await response.json();
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
    throw new Error(
      data.responseDetails || "Could not translate that text. Please try again."
    );
  }

  return data.responseData.translatedText;
}

function speakTranslation(text, lang) {
  if (!window.speechSynthesis) {
    setStatus("Text-to-speech is not supported in this browser.", "error");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang.speechLang;
  utterance.rate = 0.95;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.lang.startsWith(lang.code));
  if (preferred) utterance.voice = preferred;

  utterance.onstart = () => {
    stopSpeakBtn.hidden = false;
    speakBtn.disabled = true;
  };

  utterance.onend = utterance.onerror = () => {
    stopSpeakBtn.hidden = true;
    speakBtn.disabled = false;
  };

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  stopSpeakBtn.hidden = true;
  speakBtn.disabled = false;
}

async function handleTranslate() {
  const text = sourceText.value.trim();
  if (!text) {
    setStatus("Please enter some text to translate.", "error");
    sourceText.focus();
    return;
  }

  const lang = getLanguageByCode(targetLang.value);
  syncMapToLanguage(lang);

  translateBtn.disabled = true;
  setStatus("Translating…", "loading");

  try {
    const result = await translateText(text, lang.code);
    currentTranslation = result;

    translatedText.textContent = result;
    resultBlock.hidden = false;
    setStatus(`Translated to ${lang.name}. Playing audio…`, "success");

    speakTranslation(result, lang);
  } catch (err) {
    setStatus(err.message || "Translation failed.", "error");
    resultBlock.hidden = true;
  } finally {
    translateBtn.disabled = false;
  }
}

function handleLanguageChange() {
  const lang = getLanguageByCode(targetLang.value);
  syncMapToLanguage(lang);
}

function handleSpeakClick() {
  if (!currentTranslation) return;
  const lang = getLanguageByCode(targetLang.value);
  speakTranslation(currentTranslation, lang);
}

populateLanguageSelect();

document.addEventListener("DOMContentLoaded", () => {
  initMap();

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
});

targetLang.addEventListener("change", handleLanguageChange);
translateBtn.addEventListener("click", handleTranslate);
speakBtn.addEventListener("click", handleSpeakClick);
stopSpeakBtn.addEventListener("click", stopSpeaking);

sourceText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleTranslate();
  }
});
