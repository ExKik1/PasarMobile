'use strict';

/**
 * KASUS 3 - CONSUMER NYATA (RabbitMQ) - PasarMobile Server
 * --------------------------------------------------------
 * Mendengarkan queue 'order.status', memproses satu per satu (prefetch=1),
 * memperbarui tabel orders, lalu MANUAL ACK. Pesan beracun / gagal berulang
 * di-reject tanpa requeue sehingga otomatis masuk ke Dead-Letter Queue
 * (via deadLetterExchange yang dideklarasikan di publisher).
 *
 * Jalankan (long-running): npm run kasus3:order:worker
 */

const { config } = require('../shared/config');
const { makeLogger } = require('../shared/logger');
const { OrderStore } = require('./order-store');
const { assertWithDlq } = require('./order-publisher-amqp');
const { VALID_STATUSES } = require('./order-consumer');

const log = makeLogger('PASAR-WORKER', 'cyan');

function getAmqp() {
  try {
    return require('amqplib');
  } catch (_) {
    throw new Error("Package 'amqplib' belum terpasang. Jalankan: npm install amqplib");
  }
}

async function main() {
  const amqp = getAmqp();
  const queue = process.env.ORDER_QUEUE || 'order.status';
  const processingMs = parseInt(process.env.PROCESSING_MS || '300', 10);
  const store = new OrderStore(process.env.ORDERS_DB || undefined);

  const conn = await amqp.connect(config.broker.rabbitUrl);
  const ch = await conn.createChannel();
  await assertWithDlq(ch, queue);
  ch.prefetch(1); // proses satu per satu (backpressure)

  log(`Worker siap, mendengarkan "${queue}" (prefetch=1). Tekan Ctrl+C untuk berhenti.`);

  ch.consume(queue, async (msg) => {
    if (!msg) return;
    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (_) {
      log.warn('pesan rusak -> reject ke DLQ');
      return ch.nack(msg, false, false); // ke DLQ
    }

    try {
      if (!payload.order_id || !VALID_STATUSES.includes(payload.status)) {
        throw new Error(`status tidak valid: ${payload.status}`);
      }
      await new Promise((r) => setTimeout(r, processingMs)); // simulasi proses lambat
      store.updateStatus(payload.order_id, payload.status, payload.timestamp);
      log.ok(`order=${payload.order_id} -> ${payload.status}`);
      ch.ack(msg); // konfirmasi sukses
    } catch (err) {
      log.warn(`gagal memproses order=${payload.order_id}: ${err.message} -> DLQ`);
      ch.nack(msg, false, false); // tanpa requeue -> diteruskan ke DLQ
    }
  });

  process.on('SIGINT', async () => {
    log.warn('SIGINT, menutup worker...');
    try {
      await ch.close();
      await conn.close();
      store.close();
    } catch (_) {}
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Gagal:', e.message);
    process.exit(1);
  });
}
