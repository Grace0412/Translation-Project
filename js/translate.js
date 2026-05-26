/** Translation API helpers and input limits. */
const Translation = (() => {
  /** Max characters users can submit (well above 10,000). */
  const MAX_QUERY_CHARS = 50000;

  /** MyMemory allows ~500 bytes per request; stay safely under for UTF-8. */
  const CHUNK_MAX_CHARS = 400;

  const CHUNK_DELAY_MS = 250;

  function splitIntoChunks(text) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= CHUNK_MAX_CHARS) return [trimmed];

    const chunks = [];
    const paragraphs = trimmed.split(/\n{2,}/);

    for (const paragraph of paragraphs) {
      if (!paragraph) continue;

      if (paragraph.length <= CHUNK_MAX_CHARS) {
        chunks.push(paragraph);
        continue;
      }

      const sentences = paragraph.split(/(?<=[.!?…])\s+/);
      let buffer = "";

      for (const sentence of sentences) {
        const candidate = buffer ? `${buffer} ${sentence}` : sentence;

        if (candidate.length <= CHUNK_MAX_CHARS) {
          buffer = candidate;
          continue;
        }

        if (buffer) {
          chunks.push(buffer);
          buffer = "";
        }

        if (sentence.length <= CHUNK_MAX_CHARS) {
          buffer = sentence;
          continue;
        }

        const words = sentence.split(/\s+/);
        let wordBuffer = "";

        for (const word of words) {
          const next = wordBuffer ? `${wordBuffer} ${word}` : word;

          if (next.length <= CHUNK_MAX_CHARS) {
            wordBuffer = next;
            continue;
          }

          if (wordBuffer) chunks.push(wordBuffer);

          if (word.length > CHUNK_MAX_CHARS) {
            for (let i = 0; i < word.length; i += CHUNK_MAX_CHARS) {
              chunks.push(word.slice(i, i + CHUNK_MAX_CHARS));
            }
            wordBuffer = "";
          } else {
            wordBuffer = word;
          }
        }

        if (wordBuffer) buffer = wordBuffer;
      }

      if (buffer) chunks.push(buffer);
    }

    return chunks;
  }

  function assertWithinLimit(text) {
    if (text.length > MAX_QUERY_CHARS) {
      throw new Error(
        `Text is too long (${text.length.toLocaleString()} characters). Maximum is ${MAX_QUERY_CHARS.toLocaleString()} characters.`
      );
    }
  }

  async function translateChunk(text, targetCode) {
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function translateText(text, targetCode, onProgress) {
    const trimmed = text.trim();
    assertWithinLimit(trimmed);

    const chunks = splitIntoChunks(trimmed);
    if (chunks.length === 0) {
      throw new Error("Please enter some text to translate.");
    }

    if (chunks.length === 1) {
      return translateChunk(chunks[0], targetCode);
    }

    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress?.(i + 1, chunks.length);
      parts.push(await translateChunk(chunks[i], targetCode));
      if (i < chunks.length - 1) {
        await delay(CHUNK_DELAY_MS);
      }
    }

    return parts.join(" ");
  }

  return {
    MAX_QUERY_CHARS,
    splitIntoChunks,
    translateText,
  };
})();
