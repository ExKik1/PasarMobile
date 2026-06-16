# PasarMobile — Implementasi Metode Integrasi Sistem

Implementasi nyata (kode yang bisa dijalankan) dari studi kasus PasarMobile:
tiga metode integrasi sistem, plus desain arsitektur (Bagian B) dan RESTful API
(Bagian C).

> **Dibangun murni dengan Node.js bawaan — TANPA dependency eksternal.**
> Tidak perlu `npm install`, tidak perlu Docker, tidak perlu akun/token apa pun.
> Cukup punya **Node.js 20.12+** lalu jalankan `npm run ...`.

## Ringkasan

| Bagian | Metode / Topik | Sifat |
|--------|----------------|-------|
| **Kasus 1** | REST API — konfirmasi pembayaran | Synchronous |
| **Kasus 2** | File + Database Integration — laporan bulanan | Batch |
| **Kasus 3** | Message Broker — update status kurir | Asynchronous |
| **Bagian B** | Arsitektur Integrasi (diagram alur data) | Dokumen |
| **Bagian C** | Desain RESTful API (stock & shipment) | REST/JSON |

Semua berjalan **lokal**: pembayaran memakai bank gateway tiruan (mock),
laporan memakai **SQLite** (file lokal), dan kurir memakai **message broker
in-memory**. Sederhana dan mudah dipelajari.

## Cara Menjalankan

Butuh **Node.js 20.12+** (dites pada Node 22). Tidak perlu `npm install`.

```bash
# Jalankan ketiga demo sekaligus
npm run demo:all

# Atau satu per satu
npm run kasus1     # REST API (synchronous)
npm run kasus2     # File + Database (batch)
npm run kasus3     # Message Broker (asynchronous)
npm run bagianC    # API stock & shipment (Bagian C), server di port 4003
```

> Catatan: skrip Kasus 2 memakai flag `--no-warnings` karena modul `node:sqlite`
> masih berstatus eksperimental di Node. Kalau laptop Anda Windows dan ingin
> menjalankan file langsung: `node src/kasus1-rest-api/demo.js`.

## Kasus 1 — REST API (Synchronous)

Konfirmasi pembayaran bersifat *synchronous*: Mobile App kirim request dan
menunggu jawaban langsung (sukses/gagal) dalam hitungan detik.

- `bank-gateway.js` — bank/payment gateway tiruan (cek saldo + idempotency).
- `payment-api.js` — REST API PasarMobile yang memanggil bank secara synchronous.
- `payment-service.js` — logika inti (validasi, idempotency key, timeout, retry) yang diuji.
- `demo.js` — simulasi Mobile App: sukses, gagal (saldo kurang), idempotency.

```bash
npm run kasus1
```
Detail: [`src/kasus1-rest-api/README.md`](src/kasus1-rest-api/README.md)

## Kasus 2 — File + Database Integration (Batch)

Laporan bulanan diproses sekali per bulan (batch).
- **Database Integration**: query agregasi langsung ke DB (SQLite).
- **File Integration**: ekspor ke CSV lalu baca & proses file.
- `aggregator.js` + `report-store.js`: agregasi per jenis/hari → tabel `monthly_summary` (idempoten per bulan).

```bash
npm run kasus2
```
Detail: [`src/kasus2-batch-report/README.md`](src/kasus2-batch-report/README.md)

## Kasus 3 — Message Broker (Asynchronous)

Update status kurir bersifat *asynchronous*: kurir publish ke queue lalu lanjut,
server membaca saat siap (tidak overload), pesan aman di queue.
- `broker.js` — message broker in-memory (durable ke disk, ack/nack, prefetch, **Dead-Letter Queue**).
- `order-consumer.js` + `order-store.js` — update tabel `orders`.
- `demo.js` — async, anti-overload, requeue saat gagal, durable.

```bash
npm run kasus3
```
Detail: [`src/kasus3-message-broker/README.md`](src/kasus3-message-broker/README.md)

## Bagian B — Arsitektur Integrasi

Diagram Alur Data (Mobile App, Web Server, Database, API/Broker) — Mermaid + ASCII:
[`docs/bagian-b-arsitektur-integrasi.md`](docs/bagian-b-arsitektur-integrasi.md)

## Bagian C — Desain RESTful API

Dua endpoint JSON yang bisa dijalankan:
- `GET /api/stock/{id}` — cek stok (Success/Fail)
- `POST /api/shipment` — kirim data pengiriman

```bash
npm run bagianC      # server di http://127.0.0.1:4003
```
Detail + contoh request/response: [`src/bagian-c-rest-api/README.md`](src/bagian-c-rest-api/README.md)

## Pengujian (Testing)

Memakai **test runner bawaan Node.js** (`node:test`), tanpa Jest:

```bash
npm test     # 23 test, semua lulus
```

| Berkas test | Menguji |
|-------------|---------|
| `test/kasus1.payment-service.test.js` | sukses, gagal gateway, timeout+retry, validasi, idempotency |
| `test/kasus2.aggregator.test.js` | agregasi per jenis/hari, format salah, file not found, idempotency per bulan |
| `test/kasus3.integration.test.js` | semua pesan diproses, pesan beracun → Dead-Letter Queue, durable |
| `test/bagianC.api.test.js` | Check Stock (success/fail), Post Shipment (success/fail) |

## Struktur Proyek

```
PasarMobile/
├── package.json
├── .env.example                   # konfigurasi opsional (port)
├── scripts/run-all.js
├── docs/
│   └── bagian-b-arsitektur-integrasi.md   # Bagian B
├── src/
│   ├── shared/                    # logger, http, config (tanpa dependency)
│   ├── kasus1-rest-api/           # REST API synchronous
│   ├── kasus2-batch-report/       # File + Database batch (SQLite)
│   ├── kasus3-message-broker/     # Message broker in-memory (+ DLQ)
│   └── bagian-c-rest-api/         # Bagian C: stock & shipment API
└── test/                          # 23 test (node:test)
```

## Contoh Input & Output

### Kasus 1 — REST API (JSON)
Request → `POST /api/payments/confirm`:
```json
{ "order_id": "ORD-1001", "account_id": "user-001", "amount": 150000 }
```
Response sukses:
```json
{ "order_id": "ORD-1001", "status": "PAID", "transaction_id": "TRX-XXXX" }
```

### Kasus 2 — File + Database (CSV → monthly_summary)
Input CSV (`date,amount,type`) → Output tabel `monthly_summary`:
```
month     type      total_amount  count
2026-05   TOPUP     30000         2
2026-05   BELANJA   5000          1
```

### Kasus 3 — Message Broker (JSON)
Pesan ke queue `order.status`:
```json
{ "order_id": "ORD-1001", "status": "delivered", "timestamp": "2026-06-16T10:00:00Z" }
```
→ tabel `orders` diperbarui; pesan dengan status tidak dikenal masuk Dead-Letter Queue.

## Diagram Alur (ringkas)

```
KASUS 1 (synchronous):
  Mobile App --POST /confirm--> Payment API --charge--> Bank Gateway (mock)
            <----- JSON -------             <-- resp --

KASUS 2 (batch):
  [DB Transaksi SQLite] --exporter--> CSV --aggregator--> [monthly_summary]
                        \--------- query SELECT langsung ---------/

KASUS 3 (asynchronous):
  Kurir --publish--> [Queue order.status] --consume--> Consumer --> [orders]
                              | gagal berulang
                              +--> [order.status.dlq] (Dead-Letter Queue)
```
