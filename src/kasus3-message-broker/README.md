# Kasus 3 — Messaging Integration / Message Broker (Asynchronous)

**Skenario:** Update status kurir asynchronous tanpa membuat server PasarMobile overload.

## Alasan Pemilihan Metode

- Bersifat **asynchronous**: server tidak perlu menunggu respons kurir secara langsung.
- **Message Broker** (RabbitMQ/Kafka): kurir kirim pesan ke antrian, PasarMobile baca saat siap.
- **Cegah overload**: update tracking bisa ratusan/menit; queue meredam lonjakan.
- **Tahan gagal**: jika kurir/server lambat atau mati, pesan tetap aman di antrian.

## Komponen

| File | Peran |
|------|-------|
| `broker.js` | Message broker ala RabbitMQ memakai modul bawaan Node. Mendukung **queue durable** (disimpan ke disk), **ack**, **nack + requeue**, dan **prefetch** (backpressure). |
| `courier-producer.js` | Sistem kurir: publish update status sangat cepat lalu langsung lanjut (*fire-and-forget*). |
| `pasar-consumer.js` | Server PasarMobile: konsumsi pesan **sesuai kapasitas** (prefetch), proses tiap pesan butuh waktu. |
| `demo.js` | Demo dua bagian: (1) async + anti-overload + requeue, (2) durability lintas "restart". |

## Pemetaan ke RabbitMQ

| Proyek ini | RabbitMQ (amqplib) |
|------------|--------------------|
| `broker.publish(queue, msg)` | `channel.sendToQueue(queue, buffer)` |
| `broker.consume(queue, handler, { prefetch })` | `channel.consume(queue, onMessage)` + `channel.prefetch(n)` |
| auto-ack saat handler sukses | `channel.ack(msg)` |
| `meta.nack(true)` / handler throw | `channel.nack(msg, false, true)` (requeue) |
| file `queue-*.json` di disk | queue durable + pesan persistent |

## Menjalankan

```bash
npm run kasus3
```

## Yang Ditunjukkan Demo

**Bagian 1 — Asynchronous + cegah overload**
- Kurir mengirim 20 update sangat cepat (tiap ~30ms) dan **langsung lanjut**.
- Server memproses dengan `prefetch=2` (maks 2 pesan sekaligus), tiap pesan ~250ms.
- Akibatnya banyak pesan **menunggu aman di queue** — server **tidak overload**.
- Satu paket (`SHP-102`) sengaja gagal di percobaan pertama → **NACK + requeue** →
  diproses ulang sampai sukses.

**Bagian 2 — Durable queue**
- Kurir mengirim 5 update, lalu server "mati" sebelum sempat memproses.
- Pesan tersimpan di `data/queue-courier.status.json`.
- Saat server hidup lagi (broker dimuat ulang dari disk), **pesan masih ada** dan
  langsung diproses. Tidak ada yang hilang.

> Di produksi nyata gunakan RabbitMQ atau Kafka. Broker di sini mereplikasi konsep
> intinya agar demo bisa berjalan tanpa server tambahan.
