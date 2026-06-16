# Bagian C — Desain RESTful API

Dua endpoint REST (format JSON) sesuai soal. Implementasi ringan memakai modul
`http` bawaan Node.js.

## Menjalankan

```bash
npm run bagianC
# server berjalan di http://127.0.0.1:4003
```

## 1. Check Stock — cek stok barang ke sistem Gudang

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `/api/stock/{id}` |
| **Status** | Success / Fail |

**Contoh request:**
```
GET /api/stock/PRD-001
```

**Response SUCCESS (200):**
```json
{
  "status": "success",
  "message": "Stok berhasil dicek",
  "data": {
    "product_id": "PRD-001",
    "name": "Kaos Polos",
    "available_stock": 25,
    "in_stock": true,
    "warehouse": "JKT-01"
  }
}
```

**Response FAIL (404) — produk tidak ditemukan:**
```json
{
  "status": "fail",
  "message": "Produk dengan id PRD-999 tidak ditemukan",
  "data": null
}
```

```bash
curl http://127.0.0.1:4003/api/stock/PRD-001
```

## 2. Post Shipment — kirim data pengiriman ke sistem Kurir

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/api/shipment` |
| **Body** | Customer Data (JSON) |

**Contoh request body (Customer Data):**
```json
{
  "order_id": "ORD-1001",
  "courier": "JNE",
  "customer": {
    "name": "Budi",
    "phone": "08123456789",
    "address": "Jl. Merdeka No. 10",
    "city": "Jakarta",
    "postal_code": "12345"
  },
  "items": [
    { "product_id": "PRD-001", "qty": 2 }
  ]
}
```

**Response SUCCESS (201):**
```json
{
  "status": "success",
  "message": "Data pengiriman berhasil dikirim ke sistem kurir",
  "data": {
    "shipment_id": "SHP-1001",
    "tracking_number": "JNE-1781621473018",
    "order_id": "ORD-1001",
    "courier": "JNE",
    "status": "SHIPMENT_CREATED",
    "created_at": "2026-06-16T14:51:13.018Z"
  }
}
```

**Response FAIL (400) — data pelanggan kurang:**
```json
{
  "status": "fail",
  "message": "customer.name wajib diisi; customer.address wajib diisi; items minimal 1",
  "data": null
}
```

```bash
curl -X POST http://127.0.0.1:4003/api/shipment \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ORD-1001","courier":"JNE","customer":{"name":"Budi","address":"Jl. Merdeka 10"},"items":[{"product_id":"PRD-001","qty":2}]}'
```

## Pengujian

```bash
npm test    # termasuk test/bagianC.api.test.js
```

## Daftar produk contoh (in-memory)

| product_id | nama | stok | gudang |
|-----------|------|------|--------|
| PRD-001 | Kaos Polos | 25 | JKT-01 |
| PRD-002 | Sepatu Lari | 0 | BDG-02 |
| PRD-003 | Tas Ransel | 8 | JKT-01 |
