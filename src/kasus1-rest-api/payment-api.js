'use strict';

/**
 * KASUS 1 - REST API (Synchronous, Request-Response)
 * ---------------------------------------------------
 * PASARMOBILE PAYMENT API (backend yang dipanggil oleh Mobile App).
 *
 * Alur synchronous:
 *   Mobile App --HTTP--> PasarMobile Payment API --HTTP--> Bank Gateway (mock)
 *                                                 <--resp--
 *               <--resp--
 *
 * PasarMobile meneruskan request ke bank dan MENUNGGU jawaban bank,
 * baru membalas ke Mobile App. Semua dalam satu siklus request-response.
 *
 * Versi sederhana: hanya memakai bank gateway lokal (mock), tanpa gateway
 * eksternal. Untuk logika lengkap dengan idempotency/timeout/retry yang diuji,
 * lihat payment-service.js.
 */

const { createJsonServer, request } = require('../shared/http');
const { makeLogger } = require('../shared/logger');
const { config } = require('../shared/config');

const log = makeLogger('PASAR-API', 'cyan');
const PORT = config.payment.apiPort;
const BANK_PORT = config.payment.bankPort;

// "Database" order in-memory untuk demo.
const orders = new Map();

const routes = {
  'GET /health': async () => ({ status: 200, body: { status: 'UP', service: 'pasar-payment-api' } }),

  // Mobile App memanggil endpoint ini untuk konfirmasi pembayaran.
  'POST /api/payments/confirm': async (body) => {
    const { order_id, account_id, amount } = body || {};
    log(`Mobile App minta konfirmasi pembayaran order=${order_id}`);

    if (!order_id || !account_id || !amount) {
      return { status: 400, body: { error: 'order_id, account_id, amount wajib diisi' } };
    }

    orders.set(order_id, { order_id, amount, status: 'PENDING' });

    // Panggil bank secara SYNCHRONOUS - tunggu jawaban langsung.
    let bankResp;
    try {
      bankResp = await request(
        { method: 'POST', port: BANK_PORT, path: '/v1/charge', timeout: 3000 },
        { order_id, account_id, amount }
      );
    } catch (err) {
      orders.get(order_id).status = 'ERROR';
      log.error(`Gagal menghubungi bank: ${err.message}`);
      return {
        status: 502,
        body: { order_id, status: 'ERROR', message: 'Gateway pembayaran tidak merespons' },
      };
    }

    const paid = bankResp.body && bankResp.body.status === 'SUCCESS';
    orders.get(order_id).status = paid ? 'PAID' : 'FAILED';

    // Balas ke Mobile App dalam respons yang sama (synchronous).
    if (paid) {
      log.ok(`order=${order_id} -> PAID, balas ke Mobile App`);
      return {
        status: 200,
        body: {
          order_id,
          status: 'PAID',
          transaction_id: bankResp.body.transaction_id,
          paid_at: bankResp.body.paid_at,
        },
      };
    }

    log.warn(`order=${order_id} -> GAGAL (${bankResp.body && bankResp.body.code})`);
    return {
      status: bankResp.status === 402 ? 402 : 400,
      body: {
        order_id,
        status: 'FAILED',
        reason: bankResp.body && (bankResp.body.message || bankResp.body.code),
      },
    };
  },

  'GET /api/payments/status': async (_body, req) => {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('order_id');
    const order = orders.get(id);
    if (!order) return { status: 404, body: { error: 'order tidak ditemukan' } };
    return { status: 200, body: order };
  },
};

const server = createJsonServer(routes);

if (require.main === module) {
  server.listen(PORT, () => log(`PasarMobile Payment API berjalan di http://127.0.0.1:${PORT}`));
}

module.exports = { server, PORT };
