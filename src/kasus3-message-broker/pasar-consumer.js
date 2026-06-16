'use strict';

/**
 * KASUS 3 - CONSUMER (Server PasarMobile)
 * ---------------------------------------
 * PasarMobile membaca update dari queue SESUAI KEMAMPUANNYA. Dengan prefetch,
 * server hanya memproses N pesan sekaligus -> tidak overload meski producer
 * mengirim jauh lebih cepat. Pesan sisa aman menunggu di queue.
 *
 * Memproses tiap pesan butuh waktu (mis. update DB tracking), jadi consumer
 * sengaja dibuat lebih lambat dari producer untuk menunjukkan antrian bekerja.
 */

const { makeLogger } = require('../shared/logger');

const log = makeLogger('PASAR-SERVER', 'cyan');

/**
 * @param {MessageBroker} broker
 * @param {string} queueName
 * @param {object} opts { prefetch, processingDelayMs, onProcessed, failShipmentOnce }
 */
function startConsumer(broker, queueName, opts = {}) {
  const processed = [];
  // Untuk demo NACK/requeue: gagalkan satu pesan pada percobaan pertama.
  const failedOnce = new Set();
  const failTarget = opts.failShipmentOnce || null;

  broker.consume(
    queueName,
    async (payload, meta) => {
      // Simulasi kegagalan sementara (mis. DB sempat down) lalu pulih.
      if (failTarget && payload.shipment_id === failTarget && !failedOnce.has(meta.id)) {
        failedOnce.add(meta.id);
        log.warn(`gagal memproses #${meta.id} (${payload.shipment_id}) -> NACK, requeue`);
        throw new Error('Simulasi kegagalan sementara');
      }

      processed.push(payload);
      log(
        `proses #${meta.id} ${payload.shipment_id} -> ${payload.status} ` +
          `(percobaan ke-${meta.attempts}, sisa di queue: ${broker.depth(queueName)})`
      );
      if (opts.onProcessed) opts.onProcessed(payload, meta);
    },
    {
      prefetch: opts.prefetch || 2,
      processingDelayMs: opts.processingDelayMs != null ? opts.processingDelayMs : 200,
    }
  );

  return { processed };
}

module.exports = { startConsumer };
