# Kasus 1 — REST API (Synchronous, Request-Response)

**Skenario:** Konfirmasi pembayaran real-time antara Mobile App dan Bank.

## Alasan Pemilihan Metode

- Konfirmasi pembayaran butuh **respons instan (< 3 detik)**.
- REST API bersifat **synchronous**: kirim request → langsung dapat response sukses/gagal.
- Bank & payment gateway (Midtrans, Xendit, QRIS) sudah menyediakan REST API standar.

## Arsitektur

```
Mobile App ──HTTP POST──> PasarMobile Payment API ──HTTP POST──> Bank Gateway
           <──response───                          <──response──
```

Setiap panah adalah satu siklus **request → tunggu → response**. PasarMobile
meneruskan permintaan ke bank dan **menunggu** jawaban sebelum membalas Mobile App.

## Komponen

| File | Peran | Port |
|------|-------|------|
| `bank-gateway.js` | Mock bank/payment gateway. Endpoint `POST /v1/charge`. Cek saldo, idempotency, latensi simulasi 150–600ms. | 4001 |
| `payment-api.js` | REST API PasarMobile. Endpoint `POST /api/payments/confirm` memanggil bank secara synchronous. | 4002 |
| `demo.js` | Simulasi Mobile App menjalankan 3 skenario. | — |

## Menjalankan

```bash
npm run kasus1
```

Skenario yang ditunjukkan:
1. **Sukses** — Order #1001 Rp150.000 (saldo cukup) → `PAID`.
2. **Gagal** — Order #1002 Rp200.000 (saldo hanya Rp50.000) → `FAILED` (HTTP 402).
3. **Idempotency** — Order #1001 dikirim ulang → hasil sama, tidak dobel potong saldo.

Tiap request mendapat response langsung (umumnya beberapa ratus milidetik),
menegaskan karakteristik **synchronous**.

## Contoh Request Manual

Jalankan server di dua terminal terpisah, lalu kirim request:

```bash
# terminal 1
npm run kasus1:gateway
# terminal 2
npm run kasus1:api

# kirim konfirmasi pembayaran
curl -s -X POST http://127.0.0.1:4002/api/payments/confirm \
  -H 'Content-Type: application/json' \
  -d '{"order_id":"ORD-2001","account_id":"user-001","amount":100000}'
```

Contoh response sukses:

```json
{ "order_id": "ORD-2001", "status": "PAID", "transaction_id": "TRX-XXXX", "paid_at": "..." }
```
