# PasarMobile — Implementasi Metode Integrasi Sistem

Proyek ini adalah **implementasi nyata (kode yang bisa dijalankan)** dari Bagian A
studi kasus PasarMobile: *Analisis & Pemilihan Metode Integrasi*. Setiap kasus
diwujudkan menjadi program kecil yang mendemonstrasikan karakteristik metode
integrasi yang dipilih.

> Dibangun **murni dengan Node.js bawaan** (tanpa dependency eksternal sama sekali),
> sehingga bisa langsung dijalankan tanpa `npm install`.

## Ringkasan Pemilihan Metode

| Kasus | Kebutuhan | Metode Dipilih | Sifat |
|-------|-----------|----------------|-------|
| **1** | Konfirmasi pembayaran real-time (Mobile App ↔ Bank) | **API Integration (REST API)** | Synchronous / Request-Response |
| **2** | Laporan keuangan batch bulanan dari data transaksi | **File Integration + Database Integration** | Batch Processing |
| **3** | Update status kurir tanpa membuat server overload | **Messaging Integration (Message Broker)** | Asynchronous |

---

## Kasus 1 — REST API (Synchronous)

**Kenapa REST API?** Konfirmasi pembayaran bersifat *synchronous*: Mobile App
mengirim request dan harus menunggu jawaban langsung dari bank (sukses/gagal)
dalam hitungan detik (< 3 detik). Tidak boleh ada antrian/penundaan. Semua payment
gateway populer (Midtrans, Xendit, GoPay, QRIS) menyediakan REST API standar.

**Yang diimplementasikan:**
- `bank-gateway.js` — mock payment gateway/bank (REST) dengan cek saldo + idempotency.
- `payment-api.js` — REST API PasarMobile yang memanggil bank **secara synchronous**.
- `demo.js` — simulasi Mobile App: pembayaran sukses, gagal (saldo kurang), dan uji idempotency.

```bash
npm run kasus1
```

Detail: [`src/kasus1-rest-api/README.md`](src/kasus1-rest-api/README.md)

---

## Kasus 2 — File + Database Integration (Batch)

**Kenapa File/Database Integration?** Laporan bulanan tidak butuh real-time,
diproses sekali per bulan (*batch processing*) untuk data dalam jumlah besar.
- **Database Integration** — sistem laporan melakukan query `SELECT` langsung ke
  database transaksi. Efisien bila satu infrastruktur.
- **File Integration** — sistem transaksi mengekspor data ke CSV, lalu sistem
  laporan membaca & memproses file itu. Cocok bila sistem terpisah.

**Yang diimplementasikan:**
- `seed-database.js` — membuat database transaksi (SQLite bawaan Node) + data contoh.
- `db-integration.js` — laporan via query `SELECT` agregasi langsung ke DB.
- `file-integration.js` — ekspor CSV lalu baca & proses file CSV.
- `generate-report.js` — menjalankan kedua metode dan **memverifikasi hasilnya identik**.

```bash
npm run kasus2
```

Detail: [`src/kasus2-batch-report/README.md`](src/kasus2-batch-report/README.md)

---

## Kasus 3 — Message Broker (Asynchronous)

**Kenapa Message Broker?** Update status kurir bersifat *asynchronous* dan bisa
datang ratusan per menit. Dengan message broker (konsep RabbitMQ/Kafka):
- Sistem kurir kirim pesan ke **queue** lalu langsung lanjut (tidak menunggu).
- Server PasarMobile membaca queue **sesuai kapasitasnya** (tidak overload).
- Bila server sibuk, pesan **aman menunggu** di queue.
- Bila sistem kurir/server mati, pesan **tidak hilang** (durable).

**Yang diimplementasikan:**
- `broker.js` — message broker ala RabbitMQ (queue durable, ack/nack, prefetch/backpressure).
- `courier-producer.js` — sistem kurir yang mengirim update sangat cepat (fire-and-forget).
- `pasar-consumer.js` — server PasarMobile yang memproses pelan sesuai kapasitas.
- `demo.js` — menunjukkan async, anti-overload, requeue saat gagal, dan durability.

```bash
npm run kasus3
```

Detail: [`src/kasus3-message-broker/README.md`](src/kasus3-message-broker/README.md)

---

## Cara Menjalankan

Butuh **Node.js 20.12+** (dites pada Node 22). Mode demo **tidak perlu** `npm install`.

```bash
# Jalankan ketiga demo sekaligus
npm run demo:all

# Atau satu per satu
npm run kasus1     # REST API (synchronous)
npm run kasus2     # File + Database (batch)
npm run kasus3     # Message Broker (asynchronous)
```

## Mode Demo vs Mode Nyata

Setiap kasus mendukung **dua mode**, dipilih lewat file `.env` (salin dari `.env.example`):

| Kasus | Mode demo (default) | Mode nyata | Variabel |
|-------|---------------------|-----------|----------|
| 1 — Pembayaran | `mock` (bank lokal) | **Midtrans** Core API | `PAYMENT_MODE` |
| 2 — Laporan | `sqlite` (file lokal) | **PostgreSQL** | `DB_DRIVER` |
| 3 — Kurir | `memory` (broker lokal) | **RabbitMQ** | `BROKER_DRIVER` |

Mode nyata memakai layanan sungguhan (Midtrans sandbox, PostgreSQL, RabbitMQ).
Layanan PostgreSQL & RabbitMQ tersedia lewat `docker compose up -d`.

➡️ **Panduan langkah demi langkah lengkap (termasuk kredensial/token, Docker, webhook,
penjadwalan, dan troubleshooting) ada di [`SETUP.md`](SETUP.md).**

> Catatan: skrip Kasus 2 memakai flag `--no-warnings` karena modul `node:sqlite`
> masih berstatus eksperimental di Node.

## Struktur Proyek

```
PasarMobile/
├── package.json
├── scripts/
│   └── run-all.js                 # menjalankan ketiga demo
└── src/
    ├── shared/                    # util bersama (logger, http) - tanpa dependency
    │   ├── logger.js
    │   └── http.js
    ├── kasus1-rest-api/           # REST API synchronous
    │   ├── bank-gateway.js
    │   ├── payment-api.js
    │   ├── demo.js
    │   └── README.md
    ├── kasus2-batch-report/       # File + Database batch
    │   ├── seed-database.js
    │   ├── db-integration.js
    │   ├── file-integration.js
    │   ├── generate-report.js
    │   └── README.md
    └── kasus3-message-broker/     # Message Broker asynchronous
        ├── broker.js
        ├── courier-producer.js
        ├── pasar-consumer.js
        ├── demo.js
        └── README.md
```

## Catatan tentang Dependency Eksternal

Di lingkungan produksi nyata, metode-metode ini biasanya memakai layanan eksternal
(gateway pembayaran sungguhan untuk Kasus 1; RabbitMQ/Kafka untuk Kasus 3). Pada
proyek ini, komponen tersebut **direplikasi konsepnya** dengan modul bawaan Node.js
agar bisa dijalankan tanpa infrastruktur tambahan, sambil tetap menunjukkan
karakteristik utama tiap metode (synchronous, batch, asynchronous).
