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
const mapTitle = document.getElementById("map-title");
const mapSubtitle = document.getElementById("map-subtitle");
const yearEl = document.getElementById("year");

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let map;
let marker;
let currentTranslation = "";
let currentLanguage = getLanguageByCode("es");
let recognition;
let isRecording = false;
let voiceTranscript = "";
let voiceInterim = "";
let lastRecognitionError = null;

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

function setRecordingUI(active) {
  isRecording = active;
  recordBtn.classList.toggle("is-recording", active);
  recordBtn.setAttribute("aria-pressed", String(active));
  recordBtnLabel.textContent = active ? "Stop" : "Record";
  recordBtn.disabled = !SpeechRecognition;
  translateBtn.disabled = active;
  sendVoiceBtn.hidden = active || !voiceTranscript.trim();
}

function updateVoicePreview() {
  const combined = `${voiceTranscript} ${voiceInterim}`.trim();
  if (!combined) {
    voicePreview.hidden = true;
    voicePreview.textContent = "";
    return;
  }

  voicePreview.hidden = false;
  voicePreview.textContent = combined;
}

function initSpeechRecognition() {
  if (!SpeechRecognition) {
    recordBtn.disabled = true;
    recordBtn.title = "Voice recording is not supported in this browser. Try Chrome or Safari.";
    return;
  }

  if (!window.isSecureContext) {
    recordBtn.disabled = true;
    recordBtn.title = "Voice recording requires HTTPS or localhost.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += text;
      } else {
        interim += text;
      }
    }

    if (final) {
      voiceTranscript = `${voiceTranscript} ${final}`.trim();
    }
    voiceInterim = interim.trim();
    updateVoicePreview();
  };

  recognition.onerror = (event) => {
    const messages = {
      "not-allowed":
        "Microphone access was denied. Allow the mic in your browser settings and try again.",
      "no-speech": "No speech was detected. Try speaking closer to your microphone.",
      aborted: "",
      network: "Speech recognition needs a network connection. Check your connection and try again.",
    };

    if (event.error !== "aborted") {
      lastRecognitionError = event.error;
      setStatus(messages[event.error] || "Could not recognize speech. Please try again.", "error");
    }
    stopRecording(false);
  };

  recognition.onend = () => {
    if (isRecording) {
      try {
        recognition.start();
      } catch {
        stopRecording(false);
      }
      return;
    }

    if (lastRecognitionError) {
      lastRecognitionError = null;
      sendVoiceBtn.hidden = !voiceTranscript.trim();
      return;
    }

    finishVoiceCapture();
  };
}

function startRecording() {
  if (!recognition || isRecording) return;

  stopSpeaking();
  lastRecognitionError = null;
  voiceTranscript = "";
  voiceInterim = "";
  sendVoiceBtn.hidden = true;
  updateVoicePreview();
  setStatus("Listening… speak your sentence in English.", "loading");
  setRecordingUI(true);

  try {
    recognition.start();
  } catch {
    setStatus("Could not start the microphone. Please try again.", "error");
    setRecordingUI(false);
  }
}

function stopRecording(shouldFinish = true) {
  if (!recognition || !isRecording) return;

  setRecordingUI(false);

  try {
    recognition.stop();
  } catch {
    if (shouldFinish) finishVoiceCapture();
  }
}

function finishVoiceCapture() {
  voiceInterim = "";
  const text = voiceTranscript.trim();
  updateVoicePreview();

  if (!text) {
    setStatus("No speech captured. Press Record and try again.", "error");
    sendVoiceBtn.hidden = true;
    return;
  }

  sourceText.value = text;
  sendVoiceBtn.hidden = false;
  setStatus("Recording captured. Press “Translate recording” or edit the text above.", "success");
}

async function handleVoiceTranslate() {
  const text = voiceTranscript.trim() || sourceText.value.trim();
  if (!text) {
    setStatus("Record something first, or type text to translate.", "error");
    return;
  }

  sourceText.value = text;
  await handleTranslate();
}

function handleRecordClick() {
  if (!SpeechRecognition) {
    setStatus(
      "Voice recording is not supported in this browser. Use Chrome, Edge, or Safari.",
      "error"
    );
    return;
  }

  if (isRecording) {
    stopRecording(true);
  } else {
    startRecording();
  }
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
  initSpeechRecognition();

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
});

targetLang.addEventListener("change", handleLanguageChange);
translateBtn.addEventListener("click", handleTranslate);
recordBtn.addEventListener("click", handleRecordClick);
sendVoiceBtn.addEventListener("click", handleVoiceTranslate);
speakBtn.addEventListener("click", handleSpeakClick);
stopSpeakBtn.addEventListener("click", stopSpeaking);

sourceText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleTranslate();
  }
});
