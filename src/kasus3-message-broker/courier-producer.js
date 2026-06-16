'use strict';

/**
 * KASUS 3 - PRODUCER (Sistem Kurir)
 * ---------------------------------
 * Sistem kurir mengirim update status pengiriman ke QUEUE milik broker,
 * lalu LANGSUNG lanjut (fire-and-forget). Kurir TIDAK menunggu PasarMobile
 * selesai memproses -> inilah sifat asynchronous.
 *
 * Update tracking bisa datang ratusan per menit; producer tetap cepat
 * karena hanya menaruh pesan ke antrian.
 */

const { makeLogger } = require('../shared/logger');

const log = makeLogger('KURIR', 'yellow');

const STATUSES = [
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/**
 * Kirim sejumlah update status ke queue dengan kecepatan tinggi.
 * @param {MessageBroker} broker
 * @param {string} queueName
 * @param {object} opts { count, intervalMs }
 */
function startCourierUpdates(broker, queueName, opts = {}) {
  const count = opts.count || 20;
  const intervalMs = opts.intervalMs != null ? opts.intervalMs : 50;
  let sent = 0;

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const shipmentId = 'SHP-' + (100 + (sent % 5)); // 5 paket berbeda
      const status = STATUSES[Math.min(sent % STATUSES.length, STATUSES.length - 1)];
      const id = broker.publish(queueName, {
        shipment_id: shipmentId,
        status,
        courier: 'KurirCepat',
        location: `Hub-${(sent % 3) + 1}`,
        ts: new Date().toISOString(),
      });
      sent++;
      log(`kirim update #${id} ${shipmentId} -> ${status} (langsung lanjut, tidak menunggu)`);
      if (sent >= count) {
        clearInterval(timer);
        log.ok(`Selesai mengirim ${sent} update ke queue "${queueName}".`);
        resolve(sent);
      }
    }, intervalMs);
  });
}

module.exports = { startCourierUpdates, STATUSES };
