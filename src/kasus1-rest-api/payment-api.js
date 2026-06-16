'use strict';

/**
 * KASUS 1 - REST API (Synchronous, Request-Response)
 * ---------------------------------------------------
 * PASARMOBILE PAYMENT API (backend yang dipanggil oleh Mobile App).
 *
 * Alur synchronous:
 *   Mobile App --HTTP--> PasarMobile Payment API --HTTP--> Bank Gateway
 *                                                 <--resp--
 *               <--resp--
 *
 * PasarMobile meneruskan request ke bank dan MENUNGGU jawaban bank,
 * baru membalas ke Mobile App. Semua dalam satu siklus request-response.
 */

const { createJsonServer, request } = require('../shared/http');
const { makeLogger } = require('../shared/logger');
const { config } = require('../shared/config');
const midtrans = require('./midtrans-gateway');

const log = makeLogger('PASAR-API', 'cyan');
const PORT = config.payment.apiPort;
const BANK_PORT = config.payment.bankPort;
const MODE = config.payment.mode; // 'mock' | 'midtrans'

// "Database" order in-memory untuk demo.
const orders = new Map();

/**
 * Memproses pembayaran lewat MIDTRANS sungguhan.
 * Buat transaksi (charge) lalu cek status untuk konfirmasi.
 */
async function chargeViaMidtrans(order_id, amount, extra) {
  const created = await midtrans.charge({ order_id, amount, ...extra });
  // Untuk metode async (VA), status awal 'pending' -> konfirmasi via webhook nanti.
  // Untuk demo synchronous, kita cek status terakhir.
  const status = await midtrans.getStatus(order_id).catch(() => null);
  const paid = status && status.paid;
  return {
    paid,
    transaction_id: created.transaction_id,
    transaction_status: (status && status.transaction_status) || created.transaction_status,
    va_numbers: created.va_numbers,
  };
}

const routes = {
  'GET /health': async () => ({ status: 200, body: { status: 'UP', service: 'pasar-payment-api' } }),

  // Mobile App memanggil endpoint ini untuk konfirmasi pembayaran.
  'POST /api/payments/confirm': async (body) => {
    const { order_id, account_id, amount } = body || {};
    log(`Mobile App minta konfirmasi pembayaran order=${order_id} (mode=${MODE})`);

    if (!order_id || !amount || (MODE === 'mock' && !account_id)) {
      return { status: 400, body: { error: 'order_id, amount (dan account_id utk mock) wajib diisi' } };
    }

    orders.set(order_id, { order_id, amount, status: 'PENDING' });

    // ===== MODE MIDTRANS (payment gateway sungguhan) =====
    if (MODE === 'midtrans') {
      try {
        const r = await chargeViaMidtrans(order_id, amount, body.payment || {});
        orders.get(order_id).status = r.paid ? 'PAID' : 'PENDING';
        log[r.paid ? 'ok' : 'warn'](
          `order=${order_id} -> ${r.transaction_status} (paid=${r.paid})`
        );
        return {
          status: 200,
          body: {
            order_id,
            status: r.paid ? 'PAID' : 'PENDING',
            transaction_id: r.transaction_id,
            transaction_status: r.transaction_status,
            // Untuk metode async (VA), kirim instruksi pembayaran ke Mobile App.
            payment_instructions: r.va_numbers,
          },
        };
      } catch (err) {
        orders.get(order_id).status = 'ERROR';
        log.error(`Midtrans error: ${err.message}`);
        return { status: 502, body: { order_id, status: 'ERROR', message: err.message } };
      }
    }

    // ===== MODE MOCK (bank-gateway lokal) =====
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

  // Webhook/Callback dari Midtrans. WAJIB verifikasi signature sebelum dipercaya.
  // Daftarkan URL ini di dashboard Midtrans (mis. via ngrok saat lokal).
  'POST /api/payments/webhook': async (notif) => {
    if (MODE !== 'midtrans') {
      return { status: 200, body: { ignored: true, reason: 'mode bukan midtrans' } };
    }
    if (!notif || !midtrans.verifyWebhookSignature(notif)) {
      log.warn('Webhook ditolak: signature tidak valid');
      return { status: 403, body: { error: 'INVALID_SIGNATURE' } };
    }
    const paid = ['settlement', 'capture'].includes(notif.transaction_status);
    const order = orders.get(notif.order_id) || { order_id: notif.order_id };
    order.status = paid ? 'PAID' : notif.transaction_status.toUpperCase();
    orders.set(notif.order_id, order);
    log.ok(`Webhook valid: order=${notif.order_id} status=${notif.transaction_status}`);
    return { status: 200, body: { received: true } };
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
