const axios = require("axios");
const { normalizePageResult, normalizeError } = require("../normalize");

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithHttp(url, options = {}) {
  const routing = options.routing || {};
  if (routing.browserRequired) {
    return normalizePageResult({
      ok: false,
      url,
      finalUrl: url,
      provider: "http",
      extractMode: options.extractMode || "text",
      error: normalizeError("BROWSER_REQUIRED", `Page on ${routing.host || "this site"} is JS-heavy or protected.`).error
    });
  }

  try {
    const response = await axios.get(url, {
      timeout: Number(options.timeoutMs || 15000),
      maxRedirects: 3,
      proxy: false,
      responseType: "text",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });

    const html = String(response?.data || "");
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";
    const content = stripHtml(html).slice(0, Number(options.maxChars || 5000));

    return normalizePageResult({
      ok: Boolean(content),
      url,
      finalUrl: String(response?.request?.res?.responseUrl || url),
      title,
      content,
      extractMode: options.extractMode || "text",
      provider: "http"
    });
  } catch (error) {
    return normalizePageResult({
      ok: false,
      url,
      finalUrl: url,
      provider: "http",
      extractMode: options.extractMode || "text",
      error: normalizeError("FETCH_FAILED", error.message).error
    });
  }
}

module.exports = {
  id: "http",
  fetch: fetchWithHttp
};
