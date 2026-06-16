'use strict';

/**
 * KASUS 3 - PUBLISHER NYATA (RabbitMQ) - Sistem Kurir
 * ---------------------------------------------------
 * Mengirim status pengiriman ke queue 'order.status'. Pesan dikirim PERSISTENT
 * agar tidak hilang bila broker restart.
 *
 * Jalankan: npm run kasus3:order:publish
 *           COUNT=10 npm run kasus3:order:publish
 */

const { config } = require('../shared/config');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('KURIR-AMQP', 'yellow');
const STATUSES = ['in_transit', 'delivered', 'failed'];

function getAmqp() {
  try {
    return require('amqplib');
  } catch (_) {
    throw new Error("Package 'amqplib' belum terpasang. Jalankan: npm install amqplib");
  }
}

async function main() {
  const amqp = getAmqp();
  const count = parseInt(process.env.COUNT || '8', 10);
  const queue = process.env.ORDER_QUEUE || 'order.status';

  const conn = await amqp.connect(config.broker.rabbitUrl);
  const ch = await conn.createChannel();
  // Queue durable + dead-letter routing ke '<queue>.dlq'.
  await assertWithDlq(ch, queue);

  log(`Kirim ${count} status ke queue "${queue}" ...`);
  for (let i = 0; i < count; i++) {
    const msg = {
      order_id: 'ORD-' + (1000 + i),
      status: STATUSES[i % STATUSES.length],
      timestamp: new Date().toISOString(),
    };
    ch.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), { persistent: true });
    log(`kirim order=${msg.order_id} status=${msg.status}`);
  }

  log.ok(`Selesai mengirim ${count} pesan.`);
  await ch.close();
  await conn.close();
}

/** Deklarasi queue utama dengan Dead-Letter Exchange + DLQ. */
async function assertWithDlq(ch, queue) {
  const dlx = `${queue}.dlx`;
  const dlq = `${queue}.dlq`;
  await ch.assertExchange(dlx, 'fanout', { durable: true });
  await ch.assertQueue(dlq, { durable: true });
  await ch.bindQueue(dlq, dlx, '');
  await ch.assertQueue(queue, { durable: true, deadLetterExchange: dlx });
}

module.exports = { assertWithDlq };

if (require.main === module) {
  main().catch((e) => {
    console.error('Gagal:', e.message);
    process.exit(1);
  });
}
