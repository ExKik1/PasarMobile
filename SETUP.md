# Panduan Menjalankan PasarMobile (Detail)

Panduan lengkap menjalankan project setelah di-`clone`, dari **mode demo** sampai
**implementasi nyata** (Midtrans, PostgreSQL, RabbitMQ).

Setiap kasus punya **dua mode**, dipilih lewat file `.env`:

| Kasus | Mode demo | Mode nyata | Variabel |
|-------|-----------|-----------|----------|
| 1 — Pembayaran | `mock` (bank lokal) | `midtrans` (gateway asli) | `PAYMENT_MODE` |
| 2 — Laporan | `sqlite` (file lokal) | `postgres` (server asli) | `DB_DRIVER` |
| 3 — Kurir | `memory` (broker lokal) | `rabbitmq` (server asli) | `BROKER_DRIVER` |

---

## 0. Prasyarat

| Tool | Versi | Cek |
|------|-------|-----|
| **Node.js** | **20.12+** (disarankan 22) | `node --version` |
| **npm** | bawaan Node | `npm --version` |
| **Git** | apa saja | `git --version` |
| **Docker** (opsional, untuk mode nyata Kasus 2 & 3) | apa saja | `docker --version` |

> Belum punya Node? Install via [nvm](https://github.com/nvm-sh/nvm) (Linux/Mac)
> atau installer resmi dari nodejs.org (Windows). Lalu: `nvm install 22 && nvm use 22`.

---

## 1. Clone & siapkan konfigurasi

```bash
git clone https://github.com/ExKik1/PasarMobile.git
cd PasarMobile

# salin contoh konfigurasi menjadi .env
cp .env.example .env       # Windows PowerShell: copy .env.example .env
```

`.env` sudah berisi nilai default mode demo, jadi project **langsung bisa jalan**
tanpa mengisi apa pun.

---

## 2. Cara TERCEPAT — jalankan semua demo

Mode demo **tidak butuh `npm install`** (murni Node.js bawaan):

```bash
npm run demo:all       # menjalankan Kasus 1, 2, 3 berurutan
```

Atau satu per satu:

```bash
npm run kasus1         # REST API (synchronous)
npm run kasus2         # File + Database (batch)
npm run kasus3         # Message Broker (asynchronous)
```

> **Catatan Windows:** semua perintah `npm run ...` di atas sudah lintas-OS.
> Bila ingin menjalankan file langsung, contoh: `node src/kasus1-rest-api/demo.js`.

---

## 3. Pasang dependency untuk MODE NYATA

Hanya diperlukan bila Anda mau memakai Midtrans / PostgreSQL / RabbitMQ:

```bash
npm install            # memasang amqplib (RabbitMQ) & pg (PostgreSQL)
```

> Keduanya ada di `optionalDependencies`, jadi mode demo tetap jalan meski
> langkah ini dilewati. Midtrans **tidak** butuh package tambahan.

---

## 4. KASUS 1 — Pembayaran nyata via Midtrans

### 4a. Mode demo (default)
```bash
npm run kasus1
```

### 4b. Mode nyata (Midtrans Sandbox)

1. Daftar gratis di **https://dashboard.sandbox.midtrans.com** (lingkungan sandbox).
2. Buka **Settings → Access Keys**, salin **Server Key** dan **Client Key**.
3. Isi `.env`:
   ```
   PAYMENT_MODE=midtrans
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
   MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx
   MIDTRANS_IS_PRODUCTION=false
   ```
4. Jalankan API PasarMobile:
   ```bash
   npm run kasus1:api
   ```
5. Dari terminal lain, kirim permintaan pembayaran (membuat transaksi VA BCA):
   ```bash
   curl -X POST http://127.0.0.1:4002/api/payments/confirm \
     -H "Content-Type: application/json" \
     -d '{"order_id":"ORD-DEMO-1","amount":50000,"payment":{"payment_type":"bank_transfer","bank":"bca"}}'
   ```
   Respons berisi `transaction_status` dan instruksi `payment_instructions` (nomor VA).

#### Webhook (konfirmasi otomatis saat dibayar)
Midtrans mengirim notifikasi ke endpoint `POST /api/payments/webhook`. Agar bisa
diakses Midtrans saat di laptop, buat URL publik dengan **ngrok**:

```bash
ngrok http 4002
# salin URL https-nya, lalu set di dashboard Midtrans:
# Settings -> Configuration -> Payment Notification URL:
#   https://xxxx.ngrok-free.app/api/payments/webhook
```

Endpoint webhook **memverifikasi signature SHA512** sebelum mempercayai notifikasi
(lihat `verifyWebhookSignature` di `midtrans-gateway.js`).

---

## 5. KASUS 2 — Laporan nyata via PostgreSQL

### 5a. Mode demo (SQLite, default)
```bash
npm run kasus2                 # bulan default 2026-06
node --no-warnings src/kasus2-batch-report/generate-report.js 2026-05
```

### 5b. Mode nyata (PostgreSQL)

1. Nyalakan PostgreSQL (paling mudah via Docker):
   ```bash
   docker compose up -d postgres
   ```
2. Pasang driver bila belum: `npm install pg`
3. Set di `.env`:
   ```
   DB_DRIVER=postgres
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=pasarmobile
   PGUSER=postgres
   PGPASSWORD=postgres
   ```
4. Jalankan (tabel dibuat & di-seed otomatis bila kosong):
   ```bash
   npm run kasus2
   ```

Output yang sama dihasilkan oleh **Database Integration** (query agregasi langsung)
dan **File Integration** (ekspor CSV lalu dibaca) — keduanya diverifikasi konsisten.

#### Menjadwalkan laporan otomatis tiap akhir bulan (batch)
- **Linux/Mac (cron)** — jalankan tiap tanggal 1 pukul 02:00:
  ```bash
  crontab -e
  # tambahkan baris berikut (sesuaikan path):
  0 2 1 * * cd /path/PasarMobile && /usr/bin/node --no-warnings src/kasus2-batch-report/generate-report.js
  ```
- **Windows** — gunakan Task Scheduler dengan aksi menjalankan perintah `node` yang sama.

---

## 6. KASUS 3 — Update kuril nyata via RabbitMQ

### 6a. Mode demo (broker in-memory, default)
```bash
npm run kasus3
```

### 6b. Mode nyata (RabbitMQ)

1. Nyalakan RabbitMQ:
   ```bash
   docker compose up -d rabbitmq
   # panel admin: http://localhost:15672  (login guest / guest)
   ```
2. Pasang client bila belum: `npm install amqplib`
3. Set di `.env`:
   ```
   BROKER_DRIVER=rabbitmq
   RABBITMQ_URL=amqp://guest:guest@localhost:5672
   COURIER_QUEUE=courier.status
   CONSUMER_PREFETCH=5
   ```
4. **Terminal A** — jalankan worker server PasarMobile (long-running):
   ```bash
   npm run kasus3:worker
   ```
5. **Terminal B** — kirim update status dari sistem kurir:
   ```bash
   npm run kasus3:publish            # default 20 pesan
   COUNT=100 INTERVAL_MS=20 npm run kasus3:publish   # uji beban
   ```

#### Membuktikan sifat-sifatnya
- **Asynchronous**: producer (`publish`) selesai duluan tanpa menunggu worker.
- **Anti-overload**: naikkan `COUNT`, worker tetap memproses sesuai `CONSUMER_PREFETCH`;
  sisa pesan menumpuk aman di queue (lihat jumlahnya di panel `localhost:15672`).
- **Durable / tahan mati**: kirim banyak pesan, lalu **matikan worker (Ctrl+C)**
  saat masih ada antrian. Pesan tidak hilang (queue `durable` + pesan `persistent`).
  Jalankan worker lagi → sisa pesan langsung diproses.
- **Requeue saat gagal**: paket `SHP-102` sengaja gagal sekali → otomatis `nack`
  + requeue → dicoba ulang sampai sukses.

---

## 7. Mematikan layanan Docker

```bash
docker compose down        # stop container
docker compose down -v     # stop + hapus data PostgreSQL
```

---

## 8. Ringkasan perintah

| Tujuan | Perintah |
|--------|----------|
| Semua demo | `npm run demo:all` |
| Kasus 1 demo / API server | `npm run kasus1` / `npm run kasus1:api` |
| Kasus 2 (bulan tertentu) | `node --no-warnings src/kasus2-batch-report/generate-report.js 2026-05` |
| Kasus 3 demo | `npm run kasus3` |
| Kasus 3 worker / publisher | `npm run kasus3:worker` / `npm run kasus3:publish` |
| Nyalakan layanan nyata | `docker compose up -d` |
| Pasang dependency nyata | `npm install` |

---

## 9. Masalah umum (troubleshooting)

| Gejala | Penyebab & solusi |
|--------|-------------------|
| `Package 'amqplib' belum terpasang` | Jalankan `npm install amqplib` (mode RabbitMQ). |
| `Package 'pg' belum terpasang` | Jalankan `npm install pg` (mode PostgreSQL). |
| `ECONNREFUSED ...:5672` / `:5432` | Container belum jalan: `docker compose up -d`. |
| `MIDTRANS_SERVER_KEY belum diisi` | Isi key di `.env` dan set `PAYMENT_MODE=midtrans`. |
| Peringatan `ExperimentalWarning: SQLite` | Wajar (node:sqlite eksperimental). Script sudah pakai `--no-warnings`. |
| Webhook Midtrans tidak masuk | URL belum publik — gunakan `ngrok` dan daftarkan URL-nya di dashboard. |
