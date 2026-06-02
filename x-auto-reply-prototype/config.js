export const CONFIG = {
  // ==========================================
  // CONFIGURATION UTAMA (Edit di sini)
  // ==========================================

  // Batas minimum karakter tweet biar nggak nge-reply tweet yang terlalu pendek (kayak "ok", "sip")
  minTweetLength: 100,

  // Jeda waktu (dalam detik) antar submit reply biar nggak kena rate limit X
  cooldownSec: 100,

  // Maksimal reply yang dikirim per jam
  maxRepliesPerHour: 30,

  // Refresh halaman otomatis setelah auto-scroll berhasil submit sejumlah ini. Set 0 untuk mematikan.
  autoRefreshAfterSubmits: 50,

  // Jarak scroll otomatis: 'medium', 'more', atau 'deep'
  autoScrollDistanceMode: 'medium',

  // Maksimal panjang karakter untuk reply kita
  maxReplyLength: 150,

  // Maksimal umur tweet (dalam jam) yang boleh di-reply. Tweet lama di-skip.
  maxTweetAgeHours: 5,

  // Keyword blacklist. Kalau tweet mengandung kata-kata ini, otomatis skip.
  blacklistKeywords: 'giveaway, politics, judi, slot, crypto signal, bank, conflict, war',

  // Default Persona
  personaMode: 'balanced',
  personaStyle: 'natural',
  personaPrompt: 'Balas dalam bahasa yang sama dengan tweet. Jangan pakai hashtag berlebihan. Jangan sok tahu. Kalau konteks kurang jelas, balas singkat dan aman.',

  // Filter bahasa tweet: 'all' untuk semua bahasa, 'english' untuk hanya tweet English.
  replyLanguageMode: 'all',

  // Toggles default
  skipOwnAccount: true,
  skipPromoted: true,
  autoLikeAfterReply: false,
  postProcessReply: false,
  whitelistEnabled: true,
  whitelistAccounts: ''
};
