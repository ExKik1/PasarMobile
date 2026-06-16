'use strict';

/**
 * KASUS 3 - KONEKSI RABBITMQ NYATA (amqplib)
 * ------------------------------------------
 * Helper koneksi ke RabbitMQ sungguhan. Package 'amqplib' di-load secara lazy,
 * jadi proyek tetap bisa jalan di mode 'memory' tanpa package ini terpasang.
 *
 * Pasang dulu: npm install amqplib
 * Jalankan RabbitMQ: lihat docker-compose.yml (port 5672, panel 15672).
 */

const { config } = require('../shared/config');

function getAmqp() {
  try {
    return require('amqplib');
  } catch (_) {
    throw new Error(
      "Package 'amqplib' belum terpasang. Jalankan: npm install amqplib  (untuk BROKER_DRIVER=rabbitmq)"
    );
  }
}

/**
 * Membuat koneksi + channel dan memastikan queue durable tersedia.
 * @returns {Promise<{conn, ch, queue}>}
 */
async function connect({ prefetch } = {}) {
  const amqp = getAmqp();
  const conn = await amqp.connect(config.broker.rabbitUrl);
  const ch = await conn.createChannel();
  const queue = config.broker.queue;

  // durable: true -> definisi queue bertahan saat broker restart.
  await ch.assertQueue(queue, { durable: true });
  if (prefetch) ch.prefetch(prefetch); // backpressure: proses N pesan sekaligus

  return { conn, ch, queue };
}

module.exports = { connect };
