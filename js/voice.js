/**
 * Voice capture: enhanced microphone + Web Speech API with robust transcript assembly.
 */
const VoiceInput = (() => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const STOP_GRACE_MS = 900;
  const RESTART_DELAY_MS = 120;
  const MIN_CONFIDENCE = 0.35;

  let recognition;
  let micStream;
  let audioContext;
  let analyser;
  let levelAnimationId;
  let isRecording = false;
  let isStopping = false;
  let lastRecognitionError = null;
  let finalizeTimer = null;
  let restartTimer = null;

  /** @type {Map<number, { text: string, isFinal: boolean }>} */
  let sessionParts = new Map();
  let voiceTranscript = "";
  let voiceInterim = "";

  let recordBtn;
  let recordBtnLabel;
  let sendVoiceBtn;
  let voicePreview;
  let sourceText;
  let translateBtn;
  let micLevelEl;
  let micLevelBar;
  let setStatus;
  let onCaptureComplete;
  let stopSpeakingFn;

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function capitalizeSentence(text) {
    const trimmed = normalizeText(text);
    if (!trimmed) return "";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  function pickBestAlternative(result) {
    let best = result[0];
    let bestScore = best.confidence ?? 1;

    for (let i = 1; i < result.length; i++) {
      const alt = result[i];
      const score = alt.confidence ?? 0;
      if (score > bestScore) {
        best = alt;
        bestScore = score;
      }
    }

    if (bestScore < MIN_CONFIDENCE && result.length > 1) {
      const fallback = result.find((r) => (r.confidence ?? 0) >= MIN_CONFIDENCE);
      if (fallback) best = fallback;
    }

    return normalizeText(best.transcript);
  }

  function getSessionText() {
    const indices = [...sessionParts.keys()].sort((a, b) => a - b);
    let finals = "";
    let interim = "";

    for (const i of indices) {
      const part = sessionParts.get(i);
      if (!part?.text) continue;
      if (part.isFinal) finals += `${part.text} `;
      else interim += part.text;
    }

    return {
      finals: normalizeText(finals),
      interim: normalizeText(interim),
    };
  }

  function getFullTranscript() {
    const session = getSessionText();
    const committed = normalizeText(voiceTranscript);
    const pending = session.interim || voiceInterim;
    const sessionFinals = session.finals;

    const combined = normalizeText(
      [committed, sessionFinals, pending].filter(Boolean).join(" ")
    );

    return combined;
  }

  function updateVoicePreview() {
    const combined = getFullTranscript();
    if (!combined) {
      voicePreview.hidden = true;
      voicePreview.textContent = "";
      return;
    }

    voicePreview.hidden = false;
    voicePreview.textContent = combined;
  }

  function setRecordingUI(active) {
    isRecording = active;
    recordBtn.classList.toggle("is-recording", active);
    recordBtn.setAttribute("aria-pressed", String(active));
    recordBtnLabel.textContent = active ? "Stop" : "Record";
    recordBtn.disabled = !SpeechRecognition;
    translateBtn.disabled = active;
    sendVoiceBtn.hidden = active || !getFullTranscript();

    if (micLevelEl) micLevelEl.hidden = !active;
    if (!active) setMicLevel(0);
  }

  function setMicLevel(ratio) {
    if (!micLevelBar) return;
    const pct = Math.min(100, Math.max(0, ratio * 100));
    micLevelBar.style.width = `${pct}%`;
  }

  function commitSessionToTranscript() {
    const session = getSessionText();
    const pieces = [voiceTranscript, session.finals, session.interim, voiceInterim].filter(
      Boolean
    );
    voiceTranscript = normalizeText(pieces.join(" "));
    voiceInterim = "";
    sessionParts.clear();
    updateVoicePreview();
  }

  async function startMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone API is not available in this browser.");
    }

    stopMicrophone();

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: { ideal: 48000 },
      },
      video: false,
    });

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(micStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!isRecording || !analyser) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      setMicLevel(avg);
      levelAnimationId = requestAnimationFrame(tick);
    };

    levelAnimationId = requestAnimationFrame(tick);

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    await new Promise((resolve) => setTimeout(resolve, 280));
  }

  function stopMicrophone() {
    if (levelAnimationId) {
      cancelAnimationFrame(levelAnimationId);
      levelAnimationId = null;
    }

    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    analyser = null;
    setMicLevel(0);
  }

  function clearFinalizeTimer() {
    if (finalizeTimer) {
      clearTimeout(finalizeTimer);
      finalizeTimer = null;
    }
  }

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function scheduleFinalize() {
    clearFinalizeTimer();
    finalizeTimer = setTimeout(() => {
      finalizeTimer = null;
      if (isRecording) return;
      finishVoiceCapture();
    }, STOP_GRACE_MS);
  }

  function initRecognition() {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = !isIOS;
    recognition.maxAlternatives = 5;

    recognition.onresult = (event) => {
      for (let i = 0; i < event.results.length; i++) {
        const text = pickBestAlternative(event.results[i]);
        if (!text) continue;
        sessionParts.set(i, {
          text,
          isFinal: event.results[i].isFinal,
        });
      }

      const session = getSessionText();
      voiceInterim = session.interim;
      updateVoicePreview();
    };

    recognition.onerror = (event) => {
      const messages = {
        "not-allowed":
          "Microphone access was denied. Allow the mic in your browser settings and try again.",
        "no-speech":
          "No speech detected. Move closer to the mic and speak a bit louder, then try again.",
        aborted: "",
        network:
          "Speech recognition needs a network connection. Check your connection and try again.",
        "audio-capture":
          "Could not access the microphone. Check that no other app is using it.",
      };

      if (event.error === "no-speech" && isRecording) {
        return;
      }

      if (event.error !== "aborted") {
        lastRecognitionError = event.error;
        setStatus(
          messages[event.error] || "Could not recognize speech. Please try again.",
          "error"
        );
      }

      if (isRecording) {
        beginStop(false);
      }
    };

    recognition.onend = () => {
      if (isStopping) {
        commitSessionToTranscript();
        scheduleFinalize();
        return;
      }

      if (isRecording) {
        commitSessionToTranscript();
        clearRestartTimer();
        restartTimer = setTimeout(() => {
          restartTimer = null;
          if (!isRecording || isStopping) return;
          try {
            recognition.start();
          } catch {
            beginStop(false);
          }
        }, RESTART_DELAY_MS);
      }
    };
  }

  function finishVoiceCapture() {
    isStopping = false;
    commitSessionToTranscript();

    const text = capitalizeSentence(getFullTranscript());
    voiceTranscript = text;
    voiceInterim = "";
    updateVoicePreview();

    if (lastRecognitionError) {
      lastRecognitionError = null;
      sendVoiceBtn.hidden = !text;
      return;
    }

    if (!text) {
      setStatus("No speech captured. Press Record and try again.", "error");
      sendVoiceBtn.hidden = true;
      onCaptureComplete?.("");
      return;
    }

    sourceText.value = text;
    sendVoiceBtn.hidden = false;
    setStatus(
      "Speech captured. Press “Translate recording” or edit the text above.",
      "success"
    );
    onCaptureComplete?.(text);
  }

  async function beginRecord() {
    if (!recognition || isRecording) return;

    stopSpeakingFn?.();
    lastRecognitionError = null;
    isStopping = false;
    voiceTranscript = "";
    voiceInterim = "";
    sessionParts.clear();
    sendVoiceBtn.hidden = true;
    updateVoicePreview();
    clearFinalizeTimer();
    clearRestartTimer();

    setStatus("Starting microphone…", "loading");
    setRecordingUI(true);

    try {
      await startMicrophone();
      setStatus("Listening… speak clearly, then press Stop.", "loading");
      recognition.start();
    } catch (err) {
      setRecordingUI(false);
      stopMicrophone();
      setStatus(
        err.message || "Could not start the microphone. Please try again.",
        "error"
      );
    }
  }

  function beginStop(userInitiated = true) {
    if (!recognition || (!isRecording && !isStopping)) return;

    isStopping = true;
    isRecording = false;
    setRecordingUI(false);

    if (userInitiated) {
      setStatus("Processing speech…", "loading");
    }

    commitSessionToTranscript();

    const session = getSessionText();
    if (session.interim) {
      voiceTranscript = normalizeText(`${voiceTranscript} ${session.interim}`);
      sessionParts.clear();
      voiceInterim = "";
      updateVoicePreview();
    }

    try {
      recognition.stop();
    } catch {
      scheduleFinalize();
    }

    stopMicrophone();
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
      beginStop(true);
    } else {
      beginRecord();
    }
  }

  function getTranscript() {
    return capitalizeSentence(getFullTranscript() || sourceText?.value?.trim() || "");
  }

  function resetCapture() {
    voiceTranscript = "";
    voiceInterim = "";
    sessionParts.clear();
    updateVoicePreview();
    sendVoiceBtn.hidden = true;
  }

  function init(options) {
    ({
      recordBtn,
      recordBtnLabel,
      sendVoiceBtn,
      voicePreview,
      sourceText,
      translateBtn,
      micLevelEl,
      micLevelBar,
      setStatus,
      onCaptureComplete,
      stopSpeaking: stopSpeakingFn,
    } = options);

    if (!SpeechRecognition) {
      recordBtn.disabled = true;
      recordBtn.title =
        "Voice recording is not supported in this browser. Try Chrome or Safari.";
      return false;
    }

    if (!window.isSecureContext) {
      recordBtn.disabled = true;
      recordBtn.title = "Voice recording requires HTTPS or localhost.";
      return false;
    }

    initRecognition();
    recordBtn.addEventListener("click", handleRecordClick);
    return true;
  }

  return {
    init,
    getTranscript,
    resetCapture,
    isSupported: () => Boolean(SpeechRecognition) && window.isSecureContext,
  };
})();
