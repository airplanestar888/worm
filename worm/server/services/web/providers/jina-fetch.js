const axios = require("axios");
const { JINA_API_KEY, JINA_BASE_URL } = require("../../../config");
const { normalizePageResult, normalizeError } = require("../normalize");

function buildJinaUrl(url) {
  const normalizedBase = String(JINA_BASE_URL || "https://r.jina.ai/http://").trim();
  if (/^https?:\/\//i.test(url)) return `${normalizedBase}${url.replace(/^https?:\/\//i, "")}`;
  return `${normalizedBase}${url}`;
}

function cleanFetchedUrlContent(raw = "") {
  return String(raw || "")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^Title:\s*/im, "Judul: ")
    .replace(/^URL Source:\s*/gim, "Sumber URL: ")
    .replace(/^Markdown Content:\s*$/gim, "")
    .replace(/^\s*\/html\b.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDirectUrlContext(raw = "", maxChars = 5000) {
  const cleaned = cleanFetchedUrlContent(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Sumber URL:/i.test(line))
    .filter((line) => !/^!\[.*\]\(.*\)$/.test(line))
    .filter((line) => !/^\[!\[.*\]\(.*\)\]\(.*\)$/.test(line))
    .filter((line) => !/^blob:http/i.test(line));

  return cleaned.join("\n").slice(0, maxChars).trim();
}

async function fetchWithJina(url, options = {}) {
  if (!JINA_API_KEY) {
    return normalizePageResult({
      ok: false,
      url,
      finalUrl: url,
      provider: "jina",
      extractMode: options.extractMode || "text",
      error: normalizeError("AUTH_REQUIRED", "Jina API key not configured.").error
    });
  }

  try {
    const response = await axios.get(buildJinaUrl(url), {
      timeout: Number(options.timeoutMs || 20000),
      proxy: false,
      responseType: "text",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Authorization: `Bearer ${JINA_API_KEY}`,
        "User-Agent": "Mozilla/5.0"
      }
    });

    const raw = String(response?.data || "");
    const content = extractDirectUrlContext(raw, Number(options.maxChars || 5000));
    return normalizePageResult({
      ok: Boolean(content),
      url,
      finalUrl: url,
      title: "",
      content,
      extractMode: options.extractMode || "text",
      provider: "jina"
    });
  } catch (error) {
    return normalizePageResult({
      ok: false,
      url,
      finalUrl: url,
      provider: "jina",
      extractMode: options.extractMode || "text",
      error: normalizeError("FETCH_FAILED", error.message).error
    });
  }
}

module.exports = {
  id: "jina",
  fetch: fetchWithJina
};
