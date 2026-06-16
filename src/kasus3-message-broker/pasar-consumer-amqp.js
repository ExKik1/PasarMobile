'use strict';

/**
 * KASUS 3 - CONSUMER NYATA (RabbitMQ)
 * -----------------------------------
 * Worker server PasarMobile: konsumsi update dari queue RabbitMQ dengan prefetch
 * (backpressure) sehingga tidak overload. Tiap pesan butuh waktu proses; saat
 * sukses -> ack (hapus dari queue), saat gagal -> nack + requeue (coba lagi).
 *
 * Proses ini LONG-RUNNING. Jalankan di terminal terpisah:
 *   npm run kasus3:worker
 * Lalu kirim update dari terminal lain:
 *   npm run kasus3:publish
 *
 * Karena queue durable + pesan persistent, mematikan worker (Ctrl+C) tidak
 * menghilangkan pesan: saat worker dijalankan lagi, sisa pesan tetap diproses.
 */

const { connect } = require('./rabbitmq');
const { config } = require('../shared/config');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('PASAR-WORKER', 'cyan');
const PROCESSING_MS = parseInt(process.env.PROCESSING_MS || '250', 10);

async function main() {
  const prefetch = config.broker.prefetch;
  const { conn, ch, queue } = await connect({ prefetch });
  log(`Worker siap. queue="${queue}" prefetch=${prefetch}. Menunggu pesan ...`);

  const failedOnce = new Set();

  ch.consume(queue, async (msg) => {
    if (!msg) return;
    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (_) {
      ch.nack(msg, false, false); // pesan rusak -> buang (jangan requeue)
      return;
    }

    // Simulasi kegagalan sementara sekali untuk SHP-102 (demo NACK + requeue).
    const key = `${payload.shipment_id}:${payload.ts}`;
    if (payload.shipment_id === 'SHP-102' && !failedOnce.has(key)) {
      failedOnce.add(key);
      log.warn(`gagal proses ${payload.shipment_id} -> nack (requeue)`);
      ch.nack(msg, false, true); // requeue = true
      return;
    }

    // Simulasi kerja (mis. update DB tracking).
    await new Promise((r) => setTimeout(r, PROCESSING_MS));
    log(`proses ${payload.shipment_id} -> ${payload.status}`);
    ch.ack(msg); // konfirmasi: hapus pesan dari queue
  });

  // Tutup rapi saat Ctrl+C.
  process.on('SIGINT', async () => {
    log.warn('SIGINT diterima, menutup worker. Pesan yang belum di-ack kembali ke queue.');
    try {
      await ch.close();
      await conn.close();
    } catch (_) {}
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('Gagal:', e.message);
  process.exit(1);
});
