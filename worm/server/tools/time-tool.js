const { APP_LOCALE, APP_TIMEZONE } = require("../config");

function formatDateLabel(date) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIMEZONE
  }).format(date);
}

function formatTimeLabel(date) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: APP_TIMEZONE
  }).format(date);
}

function getZonedDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day)
  };
}

function makeLocalDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function getCurrentTimeSnapshot() {
  const now = new Date();
  const dateLabel = formatDateLabel(now);
  const timeLabel = formatTimeLabel(now);

  return {
    now,
    iso: now.toISOString(),
    timezone: APP_TIMEZONE,
    locale: APP_LOCALE,
    dateLabel,
    timeLabel
  };
}

function parseRelativeDateRequest(message, now = new Date()) {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return null;

  const directMap = [
    { pattern: /\bbesok\b|\btomorrow\b/, amount: 1 },
    { pattern: /\blusa\b/, amount: 2 },
    { pattern: /\bkemarin\b|\byesterday\b/, amount: -1 }
  ];
  for (const entry of directMap) {
    if (entry.pattern.test(text)) {
      return { unit: "day", amount: entry.amount };
    }
  }

  const baseDatePatterns = [
    /\b(\d+)\s+hari\s+(?:ke\s*)?(belakang|kebelakang|kebelang|sebelum|mundur)\s+dari\s+tanggal\s+(\d{1,2})(?:[\/\-\s]+(\d{1,2}))?(?:[\/\-\s]+(\d{2,4}))?\b/,
    /\b(\d+)\s+hari\s+(?:dari|setelah|sesudah)\s+tanggal\s+(\d{1,2})(?:[\/\-\s]+(\d{1,2}))?(?:[\/\-\s]+(\d{2,4}))?\b/
  ];
  for (let index = 0; index < baseDatePatterns.length; index += 1) {
    const match = text.match(baseDatePatterns[index]);
    if (!match) continue;
    const current = getZonedDateParts(now);
    const amount = Number(match[1]) * (index === 0 ? -1 : 1);
    const day = Number(match[index === 0 ? 3 : 2]);
    const monthValue = match[index === 0 ? 4 : 3];
    const yearValue = match[index === 0 ? 5 : 4];
    const month = monthValue ? Number(monthValue) : current.month;
    const rawYear = yearValue ? Number(yearValue) : current.year;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    return {
      unit: "day",
      amount,
      baseDate: makeLocalDate(year, month, day),
      baseLabel: formatDateLabel(makeLocalDate(year, month, day))
    };
  }

  const patterns = [
    /\b(\d+)\s+hari\s+dari\s+hari\s+ini\b/,
    /\bdalam\s+(\d+)\s+hari\b/,
    /\b(\d+)\s+hari\s+lagi\b/,
    /\b(\d+)\s+days?\s+from\s+(?:today|now)\b/,
    /\bin\s+(\d+)\s+days?\b/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { unit: "day", amount: Number(match[1]) };
  }

  const agoPatterns = [
    /\b(\d+)\s+hari\s+(?:yang\s+)?lalu\b/,
    /\b(\d+)\s+days?\s+ago\b/
  ];
  for (const pattern of agoPatterns) {
    const match = text.match(pattern);
    if (match) return { unit: "day", amount: -Number(match[1]) };
  }

  const weekPatterns = [
    /\b(\d+)\s+minggu\s+dari\s+hari\s+ini\b/,
    /\bdalam\s+(\d+)\s+minggu\b/,
    /\b(\d+)\s+minggu\s+lagi\b/,
    /\b(\d+)\s+weeks?\s+from\s+(?:today|now)\b/,
    /\bin\s+(\d+)\s+weeks?\b/
  ];
  for (const pattern of weekPatterns) {
    const match = text.match(pattern);
    if (match) return { unit: "day", amount: Number(match[1]) * 7 };
  }

  const weekAgoPatterns = [
    /\b(\d+)\s+minggu\s+(?:yang\s+)?lalu\b/,
    /\b(\d+)\s+weeks?\s+ago\b/
  ];
  for (const pattern of weekAgoPatterns) {
    const match = text.match(pattern);
    if (match) return { unit: "day", amount: -Number(match[1]) * 7 };
  }

  return null;
}

function buildCurrentTimeSystemLine() {
  const snapshot = getCurrentTimeSnapshot();
  return `Current server date/time: ${snapshot.dateLabel}, ${snapshot.timeLabel} (${snapshot.timezone}). ISO timestamp: ${snapshot.iso}.`;
}

function runCurrentTimeTool(message = "") {
  const snapshot = getCurrentTimeSnapshot();
  const relative = parseRelativeDateRequest(message, snapshot.now);

  if (relative) {
    const baseDate = relative.baseDate || snapshot.now;
    const target = new Date(baseDate.getTime() + relative.amount * 24 * 60 * 60 * 1000);
    const targetDateLabel = formatDateLabel(target);
    const baseText = relative.baseLabel ? `dari ${relative.baseLabel}` : "dari hari ini";
    const direction = relative.amount >= 0 ? baseText : relative.baseLabel ? `sebelum ${relative.baseLabel}` : "sebelum hari ini";
    const absoluteDays = Math.abs(relative.amount);
    const summaryPrefix = absoluteDays === 1 ? "1 day offset" : `${absoluteDays} day offset`;

    return {
      name: "time.now",
      summary: `${summaryPrefix} resolves to ${targetDateLabel} in ${snapshot.timezone}.`,
      directReply: relative.amount >= 0
        ? `${absoluteDays} hari ${baseText} jatuh pada ${targetDateLabel} (${snapshot.timezone}).`
        : `${absoluteDays} hari ${direction} jatuh pada ${targetDateLabel} (${snapshot.timezone}).`
    };
  }

  return {
    name: "time.now",
    summary: `Current server time is ${snapshot.dateLabel}, ${snapshot.timeLabel} (${snapshot.timezone}). ISO timestamp: ${snapshot.iso}.`,
    directReply: `Sekarang ${snapshot.dateLabel}, pukul ${snapshot.timeLabel} (${snapshot.timezone}).`
  };
}

function needsCurrentTimeTool(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  if (parseRelativeDateRequest(text)) return true;

  const datePattern = /\b(today|date|time|day|now|current time|current date)\b/;
  const indoPattern = /\b(hari ini|tanggal|jam berapa|waktu sekarang|tanggal berapa|sekarang jam)\b/;
  return datePattern.test(text) || indoPattern.test(text);
}

module.exports = {
  buildCurrentTimeSystemLine,
  parseRelativeDateRequest,
  runCurrentTimeTool,
  needsCurrentTimeTool
};
