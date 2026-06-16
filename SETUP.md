# Panduan Menjalankan PasarMobile

Panduan sederhana menjalankan project di laptop Anda. **Satu mode lokal saja** —
tanpa Docker, tanpa akun/token, tanpa `npm install`.

## 1. Software yang perlu di-install

| Software | Versi | Cek |
|----------|-------|-----|
| **Node.js** | **20.12+** (disarankan 22) | `node --version` |
| **Git** | apa saja | `git --version` |

Itu saja. npm sudah otomatis ikut saat install Node.js.

**Install Node.js:**
- **Windows:** unduh installer LTS dari [nodejs.org](https://nodejs.org).
- **Mac:** `brew install node@22` atau installer dari nodejs.org.
- **Linux:** `nvm install 22` (pakai [nvm](https://github.com/nvm-sh/nvm)).

## 2. Clone & jalankan

```bash
git clone https://github.com/ExKik1/PasarMobile.git
cd PasarMobile

# langsung jalan (tidak perlu npm install)
npm run demo:all
```

## 3. Menjalankan tiap bagian

```bash
npm run kasus1     # Kasus 1: REST API pembayaran (synchronous)
npm run kasus2     # Kasus 2: laporan File + Database (batch, SQLite)
npm run kasus3     # Kasus 3: update kurir via message broker (asynchronous)
npm run bagianC    # Bagian C: API stock & shipment (server di port 4003)
```

### Mencoba Bagian C dengan curl
Jalankan `npm run bagianC` di satu terminal, lalu di terminal lain:
```bash
# cek stok (Success)
curl http://127.0.0.1:4003/api/stock/PRD-001

# kirim pengiriman
curl -X POST http://127.0.0.1:4003/api/shipment \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ORD-1","courier":"JNE","customer":{"name":"Budi","address":"Jl. Merdeka 10"},"items":[{"product_id":"PRD-001","qty":2}]}'
```

## 4. Menjalankan test

```bash
npm test     # 23 test, semua harus lulus
```

## 5. Konfigurasi (opsional)

Semua sudah punya nilai default. Bila ingin mengubah port, salin `.env.example`
menjadi `.env`:
```bash
cp .env.example .env     # Windows: copy .env.example .env
```

## 6. Masalah umum

| Gejala | Solusi |
|--------|--------|
| `node: command not found` | Node.js belum terpasang — install dulu (lihat langkah 1). |
| Peringatan `ExperimentalWarning: SQLite` | Wajar (node:sqlite eksperimental). Script sudah pakai `--no-warnings`. |
| Di Windows `npm run` error soal env | Jalankan file langsung, mis. `node src/kasus1-rest-api/demo.js`. |
| Port sudah dipakai | Ubah port di `.env` (API_PORT/BANK_PORT/STORE_API_PORT). |

## Struktur singkat

```
src/kasus1-rest-api/      REST API pembayaran (synchronous)
src/kasus2-batch-report/  Laporan batch (SQLite + CSV)
src/kasus3-message-broker/Message broker in-memory (+ Dead-Letter Queue)
src/bagian-c-rest-api/    Bagian C: stock & shipment API
docs/                     Bagian B: diagram arsitektur
test/                     23 test (node:test)
```
