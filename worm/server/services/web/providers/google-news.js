const axios = require("axios");
const { GOOGLE_NEWS_RSS_URL } = require("../../../config");
const { normalizeSearchPayload } = require("../normalize");
const { createSearchProvider } = require("./search-provider");

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchResults(xml = "") {
  const text = String(xml || "");
  if (!text.includes("<item>")) return [];
  return Array.from(text.matchAll(/<item>([\s\S]*?)<\/item>/gi)).slice(0, 8).map((item) => {
    const block = item[1] || "";
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
    const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
    const decodedDesc = rawDesc.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    return {
      title: stripHtml(rawTitle.replace(/<!\[CDATA\[|\]\]>/g, "")),
      url: String(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim(),
      snippet: stripHtml(decodedDesc).slice(0, 320),
      source: stripHtml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "Google News"),
      publishedAt: String(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim()
    };
  }).filter((item) => item.title || item.snippet);
}

function createGoogleNewsProvider(client = axios.create({ timeout: 10000, proxy: false })) {
  return createSearchProvider({
    id: "google_news",
    label: "Google News RSS",
    search: async (query) => {
      const freshQuery = /\b\d{4}\b/.test(query) ? query : `${query} ${new Date().getFullYear()}`;
      const response = await client.get(GOOGLE_NEWS_RSS_URL, {
        params: { q: freshQuery, hl: "id", gl: "ID", ceid: "ID:id" }
      });
      return normalizeSearchPayload({ results: extractSearchResults(response.data) });
    }
  });
}

module.exports = {
  createGoogleNewsProvider
};
