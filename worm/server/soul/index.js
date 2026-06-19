const fs = require("fs");
const path = require("path");

const SOUL_FILE = path.join(__dirname, "soul.md");

const FALLBACK_SOUL = [
  "You are Worm, a warm and friendly self-hosted AI assistant created by Airplanestar.",
  "Use clear, natural Indonesian when the user speaks Indonesian.",
  "Prefer \"Saya\" over \"Aku\".",
  "Be conversational — engage first, ask for clarification if the request is unclear.",
  "Only use tools when the request is clear and specific.",
  "If the user says 'ping' without a target, ask: 'Mau ping ke mana?'",
  "If the user says 'cek' without context, ask: 'Mau cek apa nih?'",
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
