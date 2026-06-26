/**
 * Shared utility functions for web operations
 * Consolidates duplicated code across web-live-tool, google-news, http-fetch, jina-fetch
 */

/**
 * Strip HTML tags and normalize whitespace
 * @param {string} html - HTML content to strip
 * @returns {string} Plain text
 */
function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build Jina Reader URL
 * @param {string} url - Target URL
 * @param {object} options - Options
 * @returns {string} Jina URL
 */
function buildJinaUrl(url, options = {}) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const params = [];
  if (options.noCache) params.push("noCache=true");
  if (options.timeout) params.push(`timeout=${options.timeout}`);
  return params.length ? `${jinaUrl}?${params.join("&")}` : jinaUrl;
}

/**
 * Extract text content from fetched page, removing navigation and boilerplate
 * @param {string} content - Raw page content
 * @param {number} maxLength - Maximum length to return
 * @returns {string} Cleaned content
 */
function cleanFetchedContent(content, maxLength = 2000) {
  const text = String(content || "");
  // Remove common boilerplate patterns
  const cleaned = text
    .replace(/^(Home|Menu|Navigation|Skip to content|Search)[\s\S]{0,200}/i, "")
    .replace(/(Subscribe|Sign up|Newsletter|Cookie|Privacy)[\s\S]{0,200}$/i, "")
    .replace(/\[.*?(click|tap|read more).*?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) + "..." : cleaned;
}

/**
 * Parse RSS XML to extract items
 * @param {string} xml - RSS XML content
 * @param {number} maxItems - Maximum items to extract
 * @returns {Array} Parsed items
 */
function parseRssItems(xml, maxItems = 10) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) && items.length < maxItems) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");

    if (title || description) {
      items.push({
        title: stripHtml(title),
        url: link || "",
        snippet: stripHtml(description).slice(0, 300),
        publishedAt: pubDate || ""
      });
    }
  }

  return items;
}

/**
 * Extract content from XML tag
 * @param {string} xml - XML string
 * @param {string} tag - Tag name
 * @returns {string} Tag content
 */
function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

module.exports = {
  stripHtml,
  buildJinaUrl,
  cleanFetchedContent,
  parseRssItems,
  extractTag
};
