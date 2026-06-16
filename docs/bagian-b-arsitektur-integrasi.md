# Bagian B — Arsitektur Integrasi (Diagram Alur Data)

Diagram alur data PasarMobile yang menggambarkan koneksi antar sistem.
Komponen wajib: **Mobile App, Web Server, Database, & API/Broker**.

> Diagram di bawah memakai **Mermaid** (otomatis tampil sebagai gambar di GitHub).
> Untuk membuat ulang versi rapi, salin konsep ini ke **draw.io / Lucidchart / Figma**.

## Diagram Alur Data

```mermaid
flowchart LR
    MA["Mobile App\n(Pengguna PasarMobile)"]

    subgraph PASAR["PasarMobile (Backend)"]
        WS["Web Server / REST API\n(Express/Node)"]
        DB[("Database\nPostgreSQL / SQLite")]
    end

    PG["API Payment Gateway\n(REST - Midtrans/Xendit)"]
    WH["Sistem Gudang\n(REST - cek stok)"]
    MQ{{"Message Broker\n(RabbitMQ - order.status)"}}
    KURIR["Sistem Kurir"]

    %% Alur synchronous (REST)
    MA -- "1. HTTP request (JSON)" --> WS
    WS -- "2. simpan/baca data" --> DB
    WS -- "3a. konfirmasi bayar (REST, sync)" --> PG
    PG -- "respons sukses/gagal" --> WS
    WS -- "3b. cek stok (GET /api/stock/{id})" --> WH
    WH -- "Success/Fail" --> WS
    WS -- "HTTP response (JSON)" --> MA

    %% Alur asynchronous (messaging)
    KURIR -- "publish status (async)" --> MQ
    MQ -- "consume saat siap" --> WS
    WS -- "update status order" --> DB
```

## Penjelasan Alur (per metode integrasi)

1. **Synchronous (REST API) — Pembayaran & Cek Stok**
   - Mobile App mengirim **HTTP request (JSON)** ke Web Server dan menunggu respons.
   - Web Server memanggil **API Payment Gateway** (REST) dan/atau **Sistem Gudang**
     (REST), lalu mengembalikan hasilnya langsung ke Mobile App.
   - Status transaksi disimpan ke **Database**.

2. **Batch (File + Database) — Laporan Bulanan**
   - Web Server / job terjadwal membaca **Database** (atau file CSV ekspor) lalu
     menyimpan agregasi ke tabel laporan. Tidak real-time (sekali per bulan).

3. **Asynchronous (Message Broker) — Update Status Kurir**
   - **Sistem Kurir** mem-*publish* status ke **Message Broker** (queue `order.status`)
     lalu langsung lanjut.
   - Web Server meng-*consume* pesan **saat siap** (tidak overload), lalu memperbarui
     status order di **Database**.

## Pemetaan Komponen Wajib

| Komponen wajib | Pada diagram | Pada kode repo ini |
|----------------|--------------|--------------------|
| **Mobile App** | `MA` | simulasi di `kasus1-rest-api/demo.js` |
| **Web Server** | `WS` | `payment-api.js`, `bagian-c-rest-api/stock-shipment-api.js` |
| **Database** | `DB` | SQLite/PostgreSQL (`datasource.js`, `*-store.js`) |
| **API/Broker** | `PG`, `WH`, `MQ` | gateway REST, stock API, `kasus3-message-broker/broker.js` |

## Versi ASCII (alternatif tanpa render)

```
        +-------------+
        |  Mobile App |
        +------+------+
               | HTTP request/response (JSON)
               v
  ============ PasarMobile Backend ============
  |  +---------------------+    +-----------+  |
  |  |  Web Server / API   |--->| Database  |  |
  |  +----+-----------+----+    +-----------+  |
  ========|===========|=========================
          |           |                 ^
   (sync) |           | (sync)          | (async update)
          v           v                 |
   +-------------+  +------------+   +-----------------+
   | Payment     |  | Sistem     |   | Message Broker  |
   | Gateway API |  | Gudang API |   | (order.status)  |
   +-------------+  +------------+   +--------+--------+
                                              ^
                                              | publish status
                                       +------+------+
                                       | Sistem Kurir|
                                       +-------------+
```
