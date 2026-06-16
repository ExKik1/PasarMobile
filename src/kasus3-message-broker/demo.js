'use strict';

/**
 * KASUS 3 - DEMO END-TO-END (Message Broker / Asynchronous)
 *
 * Menunjukkan 4 hal:
 *   1. ASYNCHRONOUS  : kurir kirim cepat & langsung lanjut, server proses pelan.
 *   2. NO OVERLOAD   : prefetch membatasi jumlah pesan yang diproses bersamaan;
 *                      sisanya menunggu aman di queue.
 *   3. NACK + REQUEUE: pesan yang gagal diproses dikembalikan & dicoba lagi.
 *   4. DURABLE       : pesan tersimpan di disk; bila proses mati, queue tetap ada.
 */

const fs = require('fs');
const path = require('path');
const { MessageBroker } = require('./broker');
const { startCourierUpdates } = require('./courier-producer');
const { startConsumer } = require('./pasar-consumer');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('DEMO-K3', 'magenta');
const DATA_DIR = path.join(__dirname, 'data');
const QUEUE = 'courier.status';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function freshBroker() {
  // Bersihkan queue durable dari run sebelumnya agar demo konsisten.
  const file = path.join(DATA_DIR, `queue-${QUEUE}.json`);
  if (fs.existsSync(file)) fs.rmSync(file);
  return new MessageBroker({ dataDir: DATA_DIR });
}

async function main() {
  console.log('\n=== KASUS 3: Message Broker - Update Status Kurir (Asynchronous) ===\n');

  // ---------------------------------------------------------------
  // BAGIAN 1: Async + backpressure (producer cepat, consumer lambat)
  // ---------------------------------------------------------------
  console.log('--- Bagian 1: Asynchronous + cegah overload (prefetch) ---\n');
  let broker = freshBroker();

  // Consumer PasarMobile: hanya proses 2 pesan sekaligus (prefetch=2),
  // tiap pesan butuh ~250ms. Sengaja lebih lambat dari kurir.
  const { processed } = startConsumer(broker, QUEUE, {
    prefetch: 2,
    processingDelayMs: 250,
    failShipmentOnce: 'SHP-102', // demo NACK+requeue di bagian ini
  });

  // Producer kurir: kirim 20 update SANGAT cepat (tiap 30ms) lalu selesai.
  await startCourierUpdates(broker, QUEUE, { count: 20, intervalMs: 30 });

  console.log('');
  log.warn(
    `Kurir sudah selesai mengirim. Saat ini ${broker.depth(QUEUE)} pesan ` +
      `masih MENUNGGU di queue (server belum sempat proses semua).`
  );
  log('Server PasarMobile lanjut memproses sisa antrian pelan-pelan...\n');

  // Tunggu hingga semua pesan habis diproses.
  while (broker.depth(QUEUE) > 0 || processed.length < 20) {
    await sleep(150);
  }
  await sleep(300);
  log.ok(`Semua ${processed.length} update selesai diproses tanpa membuat server overload.\n`);
  broker.close();

  // ---------------------------------------------------------------
  // BAGIAN 2: Durability (pesan tidak hilang walau proses "mati")
  // ---------------------------------------------------------------
  console.log('--- Bagian 2: Durable queue (pesan aman walau sistem mati) ---\n');
  broker = freshBroker();

  // Kurir mengirim 5 update, TAPI tidak ada consumer yang berjalan.
  for (let i = 0; i < 5; i++) {
    broker.publish(QUEUE, { shipment_id: 'SHP-200', status: 'IN_TRANSIT', seq: i + 1 });
  }
  log(`Kurir kirim 5 update, lalu server PasarMobile "mati" sebelum sempat memproses.`);
  log(`Pesan tersimpan di file: data/queue-${QUEUE}.json`);
  broker.close(); // simulasi proses mati

  // Proses baru: muat ulang broker dari disk -> pesan harus masih ada.
  const broker2 = new MessageBroker({ dataDir: DATA_DIR });
  const depthAfterRestart = broker2.depth(QUEUE);
  log.ok(`Server PasarMobile hidup lagi. Pesan di queue tetap ada: ${depthAfterRestart} pesan.`);

  const recovered = [];
  startConsumer(broker2, QUEUE, {
    prefetch: 5,
    processingDelayMs: 80,
    onProcessed: (p) => recovered.push(p),
  });
  while (broker2.depth(QUEUE) > 0 || recovered.length < 5) {
    await sleep(80);
  }
  await sleep(150);
  log.ok(`${recovered.length} pesan yang sempat "tertahan" berhasil diproses setelah pulih.\n`);
  broker2.close();

  console.log('Kesimpulan:');
  console.log('- Asynchronous : kurir tidak menunggu server (fire-and-forget).');
  console.log('- Anti-overload: prefetch menahan laju proses sesuai kapasitas server.');
  console.log('- Tahan gagal  : pesan gagal di-requeue & dicoba ulang (NACK).');
  console.log('- Durable      : pesan tetap aman di antrian meski sistem mati.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
