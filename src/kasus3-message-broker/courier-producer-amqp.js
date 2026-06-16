'use strict';

/**
 * KASUS 3 - PRODUCER NYATA (RabbitMQ)
 * -----------------------------------
 * Sistem kurir mengirim update status ke queue RabbitMQ lalu langsung lanjut
 * (fire-and-forget / asynchronous). Pesan dikirim sebagai PERSISTENT agar tidak
 * hilang bila broker restart.
 *
 * Jalankan: npm run kasus3:publish        (default 20 pesan)
 *           COUNT=100 npm run kasus3:publish
 */

const { connect } = require('./rabbitmq');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('KURIR-AMQP', 'yellow');
const STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED'];

async function main() {
  const count = parseInt(process.env.COUNT || '20', 10);
  const intervalMs = parseInt(process.env.INTERVAL_MS || '50', 10);

  const { conn, ch, queue } = await connect();
  log(`Terhubung ke RabbitMQ, kirim ${count} update ke queue "${queue}" ...`);

  for (let i = 0; i < count; i++) {
    const shipmentId = 'SHP-' + (100 + (i % 5));
    const status = STATUSES[i % STATUSES.length];
    const msg = {
      shipment_id: shipmentId,
      status,
      courier: 'KurirCepat',
      location: `Hub-${(i % 3) + 1}`,
      ts: new Date().toISOString(),
    };
    // persistent: true -> pesan ditulis ke disk oleh broker (durable).
    ch.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), { persistent: true });
    log(`kirim #${i + 1} ${shipmentId} -> ${status} (langsung lanjut)`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  log.ok(`Selesai mengirim ${count} update. Producer keluar (tidak menunggu consumer).`);
  await ch.close();
  await conn.close();
}

main().catch((e) => {
  console.error('Gagal:', e.message);
  process.exit(1);
});
