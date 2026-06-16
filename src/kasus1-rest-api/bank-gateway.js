'use strict';

/**
 * KASUS 1 - REST API (Synchronous, Request-Response)
 * ---------------------------------------------------
 * MOCK PAYMENT GATEWAY / BANK (mensimulasikan Midtrans / Xendit / QRIS).
 *
 * Bank menyediakan endpoint REST. Mobile App / PasarMobile mengirim HTTP request
 * dan HARUS menunggu HTTP response langsung (sukses / gagal) dalam hitungan detik.
 * Tidak ada antrian, tidak ada penundaan: ini sifat synchronous.
 */

const { createJsonServer } = require('../shared/http');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('BANK-GATEWAY', 'magenta');
const PORT = process.env.BANK_PORT || 4001;

// "Saldo" akun untuk demo. Pembayaran di atas saldo akan ditolak.
const ACCOUNTS = {
  'user-001': { name: 'Budi', balance: 500000 },
  'user-002': { name: 'Sari', balance: 50000 },
};

// Idempotency store: order_id yang sudah diproses tidak diproses ulang.
const processed = new Map();

function randomLatencyMs() {
  // Simulasi waktu proses bank: 150-600ms (tetap < 3 detik sesuai SLA).
  return 150 + Math.floor(Math.random() * 450);
}

const routes = {
  'GET /health': async () => ({ status: 200, body: { status: 'UP', service: 'bank-gateway' } }),

  // Endpoint inti: konfirmasi pembayaran secara synchronous.
  'POST /v1/charge': async (body) => {
    const { order_id, account_id, amount } = body || {};
    log(`Terima charge: order=${order_id} account=${account_id} amount=Rp${amount}`);

    // Validasi input
    if (!order_id || !account_id || !amount) {
      return {
        status: 400,
        body: { code: 'INVALID_REQUEST', message: 'order_id, account_id, amount wajib diisi' },
      };
    }

    // Idempotency: jika order_id sudah diproses, kembalikan hasil yang sama.
    if (processed.has(order_id)) {
      log.warn(`order ${order_id} sudah diproses, kirim ulang hasil (idempotent)`);
      return { status: 200, body: processed.get(order_id) };
    }

    // Simulasikan latensi pemrosesan bank (tetap synchronous - pemanggil menunggu).
    await new Promise((r) => setTimeout(r, randomLatencyMs()));

    const account = ACCOUNTS[account_id];
    if (!account) {
      const res = { code: 'ACCOUNT_NOT_FOUND', status: 'FAILED', order_id };
      return { status: 404, body: res };
    }

    if (amount > account.balance) {
      const res = {
        code: 'INSUFFICIENT_FUNDS',
        status: 'FAILED',
        order_id,
        message: `Saldo tidak cukup (saldo Rp${account.balance})`,
      };
      processed.set(order_id, res);
      log.warn(`Pembayaran GAGAL order=${order_id} (saldo kurang)`);
      return { status: 402, body: res };
    }

    // Sukses: potong saldo dan kembalikan bukti transaksi.
    account.balance -= amount;
    const res = {
      code: 'PAID',
      status: 'SUCCESS',
      order_id,
      transaction_id: 'TRX-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      amount,
      paid_at: new Date().toISOString(),
      remaining_balance: account.balance,
    };
    processed.set(order_id, res);
    log.ok(`Pembayaran SUKSES order=${order_id} trx=${res.transaction_id}`);
    return { status: 200, body: res };
  },
};

const server = createJsonServer(routes);

if (require.main === module) {
  server.listen(PORT, () => log(`Bank gateway berjalan di http://127.0.0.1:${PORT}`));
}

module.exports = { server, PORT };
