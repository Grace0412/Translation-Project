const sourceText = document.getElementById("source-text");
const targetLang = document.getElementById("target-lang");
const translateBtn = document.getElementById("translate-btn");
const statusEl = document.getElementById("status");
const resultBlock = document.getElementById("result-block");
const translatedText = document.getElementById("translated-text");
const speakBtn = document.getElementById("speak-btn");
const stopSpeakBtn = document.getElementById("stop-speak-btn");
const recordBtn = document.getElementById("record-btn");
const recordBtnLabel = document.getElementById("record-btn-label");
const sendVoiceBtn = document.getElementById("send-voice-btn");
const voicePreview = document.getElementById("voice-preview");
const micLevelEl = document.getElementById("mic-level");
const micLevelBar = document.getElementById("mic-level-bar");
const mapTitle = document.getElementById("map-title");
const mapSubtitle = document.getElementById("map-subtitle");
const yearEl = document.getElementById("year");
const charCountEl = document.getElementById("char-count");

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

function updateCharCount() {
  if (!charCountEl || !sourceText) return;

  const length = sourceText.value.length;
  const max = Translation.MAX_QUERY_CHARS;
  charCountEl.textContent = `${length.toLocaleString()} / ${max.toLocaleString()}`;
  charCountEl.classList.toggle("char-count-over", length > max);
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

async function handleVoiceTranslate() {
  const text = VoiceInput.getTranscript();
  if (!text) {
    setStatus("Record something first, or type text to translate.", "error");
    return;
  }

  sourceText.value = text;
  await handleTranslate();
}

async function handleTranslate() {
  const text = sourceText.value.trim();
  if (!text) {
    setStatus("Please enter some text to translate.", "error");
    sourceText.focus();
    return;
  }

  if (text.length > Translation.MAX_QUERY_CHARS) {
    setStatus(
      `Text is too long. Maximum is ${Translation.MAX_QUERY_CHARS.toLocaleString()} characters.`,
      "error"
    );
    sourceText.focus();
    return;
  }

  const lang = getLanguageByCode(targetLang.value);
  syncMapToLanguage(lang);

  translateBtn.disabled = true;
  sendVoiceBtn.disabled = true;
  setStatus("Translating…", "loading");

  try {
    const result = await Translation.translateText(text, lang.code, (part, total) => {
      if (total > 1) {
        setStatus(`Translating… part ${part} of ${total}`, "loading");
      }
    });
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
    sendVoiceBtn.disabled = false;
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

  VoiceInput.init({
    recordBtn,
    recordBtnLabel,
    sendVoiceBtn,
    voicePreview,
    sourceText,
    translateBtn,
    micLevelEl,
    micLevelBar,
    setStatus,
    stopSpeaking,
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  sourceText.setAttribute("maxlength", String(Translation.MAX_QUERY_CHARS));
  updateCharCount();
});

targetLang.addEventListener("change", handleLanguageChange);
translateBtn.addEventListener("click", handleTranslate);
sendVoiceBtn.addEventListener("click", handleVoiceTranslate);
speakBtn.addEventListener("click", handleSpeakClick);
stopSpeakBtn.addEventListener("click", stopSpeaking);

sourceText.addEventListener("input", updateCharCount);
sourceText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleTranslate();
  }
});
