'use strict';

/**
 * KASUS 1 - ADAPTER PEMBAYARAN NYATA: MIDTRANS Core API
 * -----------------------------------------------------
 * Integrasi REST API sungguhan ke payment gateway Midtrans, dibuat dengan
 * modul bawaan Node.js (https + crypto) - tanpa package eksternal.
 *
 * Tiga operasi REST synchronous:
 *   charge(order)            -> POST  {base}/v2/charge        (buat transaksi)
 *   getStatus(orderId)       -> GET   {base}/v2/{order}/status (cek status)
 *   verifyWebhookSignature() -> verifikasi notifikasi webhook (SHA512)
 *
 * Dokumentasi: https://docs.midtrans.com (Core API)
 */

const https = require('https');
const crypto = require('crypto');
const { config } = require('../shared/config');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('MIDTRANS', 'magenta');

function httpsJson(method, url, { auth, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = 'Basic ' + Buffer.from(auth + ':').toString('base64');
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(
      { method, hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 10000 },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed = raw;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (_) {
            /* biarkan string */
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Midtrans request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

function ensureConfigured() {
  if (!config.payment.midtrans.serverKey) {
    throw new Error(
      'MIDTRANS_SERVER_KEY belum diisi. Set di file .env untuk memakai PAYMENT_MODE=midtrans.'
    );
  }
}

/**
 * Membuat transaksi pembayaran (contoh: Virtual Account BCA).
 * @param {{order_id:string, amount:number, payment_type?:string, bank?:string}} order
 */
async function charge(order) {
  ensureConfigured();
  const m = config.payment.midtrans;
  const payment_type = order.payment_type || 'bank_transfer';
  const payload = {
    payment_type,
    transaction_details: { order_id: order.order_id, gross_amount: order.amount },
  };
  if (payment_type === 'bank_transfer') {
    payload.bank_transfer = { bank: order.bank || 'bca' };
  }

  log(`POST /v2/charge order=${order.order_id} amount=Rp${order.amount}`);
  const res = await httpsJson('POST', `${m.baseUrl}/v2/charge`, {
    auth: m.serverKey,
    body: payload,
  });

  const b = res.body || {};
  // status_code Midtrans: 201 = transaksi dibuat (pending pembayaran)
  const ok = b.status_code === '201' || b.status_code === '200';
  return {
    ok,
    order_id: b.order_id || order.order_id,
    transaction_id: b.transaction_id,
    transaction_status: b.transaction_status, // pending | settlement | deny | ...
    payment_type: b.payment_type,
    va_numbers: b.va_numbers, // instruksi pembayaran VA (untuk async methods)
    raw: b,
  };
}

/**
 * Cek status transaksi (dipakai untuk konfirmasi synchronous).
 * transaction_status 'settlement'/'capture' = sudah dibayar.
 */
async function getStatus(orderId) {
  ensureConfigured();
  const m = config.payment.midtrans;
  log(`GET /v2/${orderId}/status`);
  const res = await httpsJson('GET', `${m.baseUrl}/v2/${encodeURIComponent(orderId)}/status`, {
    auth: m.serverKey,
  });
  const b = res.body || {};
  const paid = ['settlement', 'capture'].includes(b.transaction_status);
  return {
    paid,
    order_id: b.order_id,
    transaction_status: b.transaction_status,
    fraud_status: b.fraud_status,
    raw: b,
  };
}

/**
 * Verifikasi tanda tangan notifikasi webhook Midtrans.
 * signature_key = SHA512(order_id + status_code + gross_amount + server_key)
 * WAJIB diverifikasi sebelum mempercayai isi notifikasi.
 */
function verifyWebhookSignature(notif) {
  const m = config.payment.midtrans;
  if (!m.serverKey) return false;
  const raw = `${notif.order_id}${notif.status_code}${notif.gross_amount}${m.serverKey}`;
  const expected = crypto.createHash('sha512').update(raw).digest('hex');
  return expected === notif.signature_key;
}

module.exports = { charge, getStatus, verifyWebhookSignature };
