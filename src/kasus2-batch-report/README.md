# Kasus 2 — File Integration + Database Integration (Batch)

**Skenario:** Laporan keuangan batch bulanan dari data transaksi PasarMobile.

## Alasan Pemilihan Metode

- Laporan bulanan **tidak butuh real-time** — diproses sekali per bulan.
- **Database Integration**: sistem laporan query `SELECT` langsung ke DB transaksi.
  Efisien bila kedua sistem dalam satu infrastruktur.
- **File Integration**: sistem transaksi ekspor ke CSV, sistem laporan membaca file.
  Cocok bila sistem terpisah / beda vendor.
- Keduanya termasuk **batch processing** — memproses data besar sekaligus.

## Komponen

| File | Peran |
|------|-------|
| `seed-database.js` | Membuat database transaksi (SQLite bawaan Node `node:sqlite`) dan mengisi ~130 transaksi contoh untuk 2 bulan (Mei & Juni 2026). |
| `db-integration.js` | **Database Integration** — laporan via query `SELECT` agregasi langsung ke DB. |
| `file-integration.js` | **File Integration** — ekspor transaksi ke CSV lalu baca & proses file CSV. |
| `generate-report.js` | Menjalankan kedua metode untuk bulan yang sama dan **memverifikasi hasilnya identik**, lalu menyimpan laporan akhir. |

## Menjalankan

```bash
npm run kasus2            # default bulan 2026-06
# atau pilih bulan lain:
NODE_OPTIONS= NODE_NO_WARNINGS=1 node src/kasus2-batch-report/generate-report.js 2026-05
```

## Alur

```
                ┌──────────────────────────┐
                │  Database Sistem Transaksi │  (SQLite: transactions.db)
                └──────────────┬─────────────┘
            (A) query SELECT    │    (B) ekspor CSV
        ┌───────────────────────┘────────────────────────┐
        ▼                                                  ▼
 DATABASE INTEGRATION                              FILE INTEGRATION
 agregasi di dalam DB                       transactions-2026-06.csv
        │                                                  │
        └──────────────► Laporan Bulanan ◄─────────────────┘
                 (hasil kedua metode identik)
```

## Output

Program mencetak ringkasan (total transaksi, transaksi PAID, total pendapatan,
refund, dan pendapatan per kategori) untuk **kedua metode**, lalu memverifikasi
keduanya menghasilkan angka yang sama.

Berkas yang dihasilkan (di folder `data/`, di-`.gitignore`):
- `data/transactions.db` — database transaksi.
- `data/exports/transactions-YYYY-MM.csv` — hasil ekspor File Integration.
- `data/reports/laporan-YYYY-MM.json` — laporan lengkap (kedua metode).
- `data/reports/laporan-YYYY-MM.csv` — ringkasan pendapatan per kategori.

> Data di-seed dengan PRNG deterministik, sehingga hasil selalu konsisten setiap dijalankan.
