const JS_HEAVY_DOMAINS = [
  "x.com",
  "twitter.com",
  "notion.so",
  "www.notion.so",
  "docs.google.com",
  "drive.google.com",
  "app.slack.com",
  "discord.com"
];

const PROTECTED_HINTS = ["login", "signin", "auth", "signup"];

function extractFirstUrl(message = "") {
  const match = String(message || "").match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].replace(/[.,]+$/, "") : "";
}

function parseUrlSafe(url = "") {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isKnownJsHeavyUrl(url = "") {
  const parsed = parseUrlSafe(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  return JS_HEAVY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isLikelyProtectedUrl(url = "") {
  const parsed = parseUrlSafe(url);
  if (!parsed) return false;
  const haystack = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  return PROTECTED_HINTS.some((hint) => haystack.includes(hint));
}

function detectUrlRouting(url = "") {
  const parsed = parseUrlSafe(url);
  if (!parsed) {
    return {
      ok: false,
      browserRequired: false,
      knownJsHeavy: false,
      protected: false,
      host: ""
    };
  }

  const knownJsHeavy = isKnownJsHeavyUrl(url);
  const protectedUrl = isLikelyProtectedUrl(url);

  return {
    ok: true,
    host: parsed.hostname,
    browserRequired: knownJsHeavy || protectedUrl,
    knownJsHeavy,
    protected: protectedUrl
  };
}

module.exports = {
  extractFirstUrl,
  detectUrlRouting,
  isKnownJsHeavyUrl
};
