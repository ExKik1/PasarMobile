'use strict';

/**
 * KASUS 1 - DEMO END-TO-END
 * Menjalankan Bank Gateway + PasarMobile Payment API di satu proses,
 * lalu mensimulasikan Mobile App melakukan beberapa konfirmasi pembayaran.
 *
 * Tujuan: menunjukkan sifat SYNCHRONOUS (request -> tunggu -> response < 3 detik).
 */

const { request } = require('../shared/http');
const { makeLogger } = require('../shared/logger');
const bank = require('./bank-gateway');
const api = require('./payment-api');

const log = makeLogger('MOBILE-APP', 'green');

function listen(server, port) {
  return new Promise((resolve) => server.listen(port, resolve));
}

async function confirmPayment(scenario) {
  const t0 = Date.now();
  log(`Kirim konfirmasi pembayaran: ${scenario.label}`);
  const resp = await request(
    { method: 'POST', port: api.PORT, path: '/api/payments/confirm', timeout: 3000 },
    scenario.payload
  );
  const ms = Date.now() - t0;
  const ok = resp.body && resp.body.status === 'PAID';
  const line = `   -> HTTP ${resp.status} | status=${resp.body && resp.body.status} | waktu respons ${ms}ms`;
  if (ok) log.ok(line);
  else log.warn(line);
  if (resp.body && resp.body.reason) log(`      alasan: ${resp.body.reason}`);
  console.log('');
}

async function main() {
  console.log('\n=== KASUS 1: REST API - Konfirmasi Pembayaran Real-time (Synchronous) ===\n');

  await listen(bank.server, bank.PORT);
  await listen(api.server, api.PORT);

  // Skenario 1: pembayaran sukses (saldo cukup)
  await confirmPayment({
    label: 'Order #1001 - Rp150.000 oleh Budi (saldo cukup)',
    payload: { order_id: 'ORD-1001', account_id: 'user-001', amount: 150000 },
  });

  // Skenario 2: pembayaran gagal (saldo tidak cukup)
  await confirmPayment({
    label: 'Order #1002 - Rp200.000 oleh Sari (saldo hanya Rp50.000)',
    payload: { order_id: 'ORD-1002', account_id: 'user-002', amount: 200000 },
  });

  // Skenario 3: idempotency - kirim ulang order yang sama
  await confirmPayment({
    label: 'Order #1001 dikirim ULANG (uji idempotency)',
    payload: { order_id: 'ORD-1001', account_id: 'user-001', amount: 150000 },
  });

  console.log('Kesimpulan: setiap request menerima response langsung (< 3 detik).');
  console.log('Inilah karakteristik integrasi REST API yang synchronous.\n');

  bank.server.close();
  api.server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
