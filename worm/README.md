# worm

Localhost chat UI dengan session storage, pilihan provider/model, reasoning view, dan Deep Search Beta untuk konteks web/live.

## Setup

```bash
npm install
cp .env.example .env
```

Isi `.env` sesuai provider yang dipakai. `NVIDIA_API_KEY` opsional kalau hanya memakai Ollama.

## Telegram Bot

Worm bisa dijalankan sebagai Telegram Bot via polling, jadi tidak perlu domain publik/webhook.

Worm juga bisa cek token/pair crypto via API Dexscreener untuk query seperti `check shady tokens on dexscreener`, `top boosted token`, atau `cek token <address>`.

Untuk crypto news, Worm tetap lewat flow Deep Search yang sama, tapi bisa memakai multi-source layer gratis (CryptoPanic, GNews, Marketaux, dan RSS prioritas seperti CoinDesk, CoinTelegraph, The Block, Blockworks, Decrypt) untuk query seperti `top 5 berita BTC hari ini`.

1. Buat bot dari `@BotFather`.
2. Isi token ke `.env`:

```text
TELEGRAM_BOT_TOKEN=isi_token_bot_anda
TELEGRAM_PROVIDER=nvidia
TELEGRAM_MODEL=
TELEGRAM_MODE=medium
TELEGRAM_SURFACE_MODE=deep_surf
TELEGRAM_INCLUDE_REASONING=true
```

Jika `TELEGRAM_MODEL` kosong, Worm memakai default model sesuai provider. Restart gateway setelah mengubah `.env`.

Kalau mau layer crypto news gratis aktif, isi key yang dibutuhkan di `.env.example` (CryptoPanic / GNews / Marketaux). Kalau tidak diisi, Worm tetap fallback ke source gratis yang tersedia.

## Run

```bash
chmod +x gateway.sh
./gateway.sh
```

Windows:

```bat
gateway.bat
```

App jalan di:

```text
http://localhost:3842
```

## Arsitektur

- Node.js + Express entry di `server/worm.js`
- Frontend static di `server/static/worm.html` dan `server/static/app.js`
- Session lokal di `data/sessions` saat runtime
- Mapping session Telegram di `data/telegram-sessions.json` saat runtime
- Persona di `server/soul/soul.md`
- Tools di `server/tools`
- Web layer modular di `server/services/web/`
  - `index.js` → public interface stabil: `searchWeb()` / `fetchPage()` + default provider factory
  - `search-service.js` → orchestration search + fallback + cache TTL
  - `fetch-service.js` → URL fetch terpisah dari search
  - `router.js` → detector direct URL / JS-heavy page
  - `normalize.js` → hasil search/fetch dinormalisasi ke shape konsisten
  - `providers/*.js` → adapter/provider terpisah
  - `README.md` → contract + contoh pemakaian orchestrator lain

## Git Notes

`.env`, `node_modules`, dan `data` tidak masuk git.
