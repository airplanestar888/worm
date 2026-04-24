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

## Git Notes

`.env`, `node_modules`, dan `data` tidak masuk git.
