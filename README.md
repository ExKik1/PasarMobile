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

## Pengujian (Testing)

Test ditulis dengan **test runner bawaan Node.js** (`node:test` + `node:assert`),
jadi **tidak butuh Jest/Mocha** dan langsung bisa dijalankan:

```bash
npm test
```

Cakupan (17 test, semuanya lulus):

| Berkas test | Kasus | Skenario yang diuji |
|-------------|-------|---------------------|
| `test/kasus1.payment-service.test.js` | 1 | sukses, gagal gateway, **timeout + retry**, retry lalu sukses, validasi input, **idempotency** (key & order_id) |
| `test/kasus2.aggregator.test.js` | 2 | agregasi per jenis & per hari, format CSV salah, file tidak ditemukan, baca CSV nyata, **idempotency per bulan** |
| `test/kasus3.integration.test.js` | 3 | semua pesan diproses & status DB benar, **pesan beracun → Dead-Letter Queue**, **durable** (pulih dari disk) |

Komponen "nyata" yang ditambahkan untuk memenuhi pertimbangan teknis:

- **Kasus 1:** `payment-service.js` (validasi, idempotency key, timeout, retry terbatas,
  logging) + `transaction-store.js` (SQLite, status transaksi).
- **Kasus 2:** `aggregator.js` (total per jenis/hari) + `report-store.js`
  (tabel `monthly_summary`, idempoten per bulan).
- **Kasus 3:** `order-store.js` (tabel `orders`), `order-consumer.js`, broker dengan
  **Dead-Letter Queue**, serta varian RabbitMQ nyata `order-publisher-amqp.js` /
  `order-consumer-amqp.js` (persistent delivery, manual ack, DLQ).

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


## Contoh Input & Output

### Kasus 1 — REST API (JSON)
Request (Mobile App → `POST /api/payments/confirm`):
```json
{ "order_id": "ORD-1001", "amount": 150000, "payment_method": "qris", "idempotency_key": "key-abc" }
```
Response sukses:
```json
{ "order_id": "ORD-1001", "status": "PAID", "transaction_id": "TRX-XXXX", "idempotent_replay": false }
```
Response gagal (saldo kurang / ditolak):
```json
{ "order_id": "ORD-1002", "status": "FAILED", "reason": "INSUFFICIENT_FUNDS" }
```

### Kasus 2 — File + Database (CSV)
Input CSV hasil ekspor (`./exports/transactions-YYYY-MM.csv`):
```csv
date,amount,type
2026-05-01,10000,TOPUP
2026-05-01,5000,BELANJA
2026-05-02,20000,TOPUP
```
Output tabel `monthly_summary` (report DB):
```
month     type      total_amount  count
2026-05   TOPUP     30000         2
2026-05   BELANJA   5000          1
```

### Kasus 3 — Message Broker (JSON)
Pesan yang dipublikasikan ke queue `order.status`:
```json
{ "order_id": "ORD-1001", "status": "delivered", "timestamp": "2026-06-16T10:00:00Z" }
```
Hasil di tabel `orders` setelah diproses consumer:
```
id         status     updated_at
ORD-1001   delivered  2026-06-16T10:00:00Z
```
Pesan dengan `status` tidak dikenal akan otomatis dipindah ke `order.status.dlq`
(Dead-Letter Queue) setelah melewati batas percobaan.

## Diagram Alur (ringkas)

```
KASUS 1 (synchronous):
  Mobile App --POST /confirm--> Payment Service --charge()--> Payment Gateway
            <----- JSON -------               <---- resp ----
  (validasi -> idempotency -> timeout+retry -> simpan ke SQLite -> balas)

KASUS 2 (batch):
  [DB Transaksi] --exporter--> CSV --aggregator--> [Report DB: monthly_summary]
                 \---------- query SELECT langsung (alternatif) ----------/

KASUS 3 (asynchronous):
  Kurir(Publisher) --order.status--> [Queue] --(prefetch=1)--> Consumer --update--> [orders]
                                        |  gagal berulang
                                        +--> [order.status.dlq] (Dead-Letter Queue)
```
