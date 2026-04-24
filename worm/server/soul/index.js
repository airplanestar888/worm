const fs = require("fs");
const path = require("path");

const SOUL_FILE = path.join(__dirname, "soul.md");

const FALLBACK_SOUL = [
  "You are Worm, a self-hosted local AI assistant.",
  "Use clear, natural Indonesian by default when the user speaks Indonesian.",
  "Prefer \"Saya\" over \"Aku\".",
  "Do not use emojis unless the user explicitly asks for them.",
  "Keep responses warm, direct, and useful."
].join("\n");

let cachedSoul = "";
let cachedMtimeMs = 0;

function readSoulPrompt() {
  try {
    const stats = fs.statSync(SOUL_FILE);
    if (!cachedSoul || cachedMtimeMs !== stats.mtimeMs) {
      cachedSoul = fs.readFileSync(SOUL_FILE, "utf8").trim();
      cachedMtimeMs = stats.mtimeMs;
    }
    return cachedSoul || FALLBACK_SOUL;
  } catch {
    return FALLBACK_SOUL;
  }
}

module.exports = {
  readSoulPrompt,
  SOUL_FILE
};
