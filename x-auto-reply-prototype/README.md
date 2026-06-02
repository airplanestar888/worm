# X Co Pilot

Chrome extension (Manifest V3) buat assisted reply di timeline X pakai persona prompt + LLM endpoint.

## Isi prototype
- scan tweet di timeline
- filter blacklist keyword
- cooldown antar reply
- limit reply per jam
- generate reply dari LLM
- auto buka composer + auto submit
- dry-run mode buat testing aman
- quick toggle via popup

## Struktur
- `manifest.json`
- `background.js` → settings, rate limit, call LLM, logging
- `content.js` → scan timeline, buka composer, submit reply
- `options.*` → config endpoint, API key, persona, limit
- `popup.*` → toggle cepat

## Cara pakai
1. Buka Chrome/Brave → `chrome://extensions`
2. Aktifkan **Developer mode**
3. Klik **Load unpacked**
4. Pilih folder `x-auto-reply-prototype`
5. Buka **Options** extension
6. Isi:
   - endpoint LLM
   - API key
   - model
   - persona prompt
7. Untuk testing awal:
   - `enabled = off`
   - `dry run = on`
   - `auto submit = on`
8. Setelah yakin, nyalakan `enabled`

## Persona prompt contoh
```text
Kamu admin akun X yang witty, relevan, singkat, dan bukan buzzer. Balas dengan 1 kalimat natural. Hindari debat politik, hindari overclaim, dan kalau tweet tidak jelas lebih baik skip.
```

## Catatan penting
- Ini **prototype**, selector DOM X bisa berubah kapan aja.
- `host_permissions` masih lebar (`<all_urls>`) supaya endpoint LLM fleksibel. Buat production, sempitkan domain endpoint.
- Belum ada deteksi kuat buat skip tweet dari akun sendiri/thread sendiri.
- Belum ada queue kompleks / retry policy / captcha handling.
- Kalau model ngasih output aneh, extension tetap bisa auto submit kalau dry-run dimatiin. Jadi testing pelan-pelan.

## Next yang paling masuk akal
- skip akun sendiri / mutual tertentu
- whitelist target akun
- gaya persona per keyword/topic
- review queue sebelum submit
- export log reply
