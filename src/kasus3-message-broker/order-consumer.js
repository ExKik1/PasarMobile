'use strict';

/**
 * KASUS 3 - CONSUMER STATUS PESANAN (PasarMobile Server)
 * ------------------------------------------------------
 * Mendaftarkan handler pada broker untuk queue 'order.status'. Setiap pesan
 * memperbarui tabel orders. Memvalidasi status; status tidak dikenal dianggap
 * "pesan beracun" -> setelah maxAttempts gagal, dipindah ke Dead-Letter Queue.
 *
 * Bekerja dengan broker in-memory (mudah diuji) maupun pola yang sama di RabbitMQ.
 */

const { makeLogger } = require('../shared/logger');

const log = makeLogger('ORDER-CONSUMER', 'cyan');
const VALID_STATUSES = ['in_transit', 'delivered', 'failed'];

/**
 * @param {MessageBroker} broker
 * @param {OrderStore} store
 * @param {object} opts { queue, prefetch, processingDelayMs, maxAttempts }
 */
function startOrderConsumer(broker, store, opts = {}) {
  const queue = opts.queue || 'order.status';
  const stats = { processed: 0, deadLettered: 0 };

  broker.on('dead-letter', ({ message }) => {
    stats.deadLettered++;
    log.warn(`pesan beracun -> DLQ: order=${message.payload && message.payload.order_id}`);
  });

  broker.consume(
    queue,
    async (payload, meta) => {
      // Validasi: status harus dikenal, kalau tidak -> lempar (akan di-retry / DLQ).
      if (!payload || !payload.order_id || !VALID_STATUSES.includes(payload.status)) {
        throw new Error(`status tidak valid: ${payload && payload.status}`);
      }
      // Simulasi pemrosesan lambat (mis. update beberapa sistem).
      store.updateStatus(payload.order_id, payload.status, payload.timestamp);
      stats.processed++;
      log(`order=${payload.order_id} -> ${payload.status} (attempt ${meta.attempts})`);
    },
    {
      prefetch: opts.prefetch || 1,
      processingDelayMs: opts.processingDelayMs != null ? opts.processingDelayMs : 100,
      maxAttempts: opts.maxAttempts || 3,
    }
  );

  return stats;
}

module.exports = { startOrderConsumer, VALID_STATUSES };
