'use strict';

/**
 * KASUS 1 - LAYANAN PEMBAYARAN (logika inti, bisa diuji terpisah)
 * ---------------------------------------------------------------
 * Berisi aturan bisnis konfirmasi pembayaran TANPA bergantung pada HTTP server,
 * sehingga mudah di-unit-test. Dependensi disuntikkan (dependency injection):
 *   - gateway.charge(payload)  -> fungsi memanggil payment gateway (async)
 *   - store                    -> TransactionStore (atau objek sejenis)
 *
 * Fitur:
 *   - Validasi input
 *   - Idempotency (via idempotency_key ATAU order_id yang sudah final)
 *   - Timeout handling (Promise.race)
 *   - Retry terbatas untuk error sementara (timeout / 5xx / network)
 *   - Logging request/response
 */

const { makeLogger } = require('../shared/logger');

const log = makeLogger('PAYMENT-SVC', 'cyan');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
  }
}

const VALID_METHODS = ['bank_transfer', 'gopay', 'qris', 'credit_card'];

function validate(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') errors.push('payload tidak valid');
  const { order_id, amount, payment_method } = payload || {};
  if (!order_id) errors.push('order_id wajib diisi');
  if (amount == null || typeof amount !== 'number' || !(amount > 0))
    errors.push('amount harus angka > 0');
  if (payment_method && !VALID_METHODS.includes(payment_method))
    errors.push(`payment_method harus salah satu: ${VALID_METHODS.join(', ')}`);
  if (errors.length) throw new ValidationError(errors.join('; '));
}

/** Bungkus sebuah promise dengan batas waktu (timeout). */
function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`${label} timeout setelah ${ms}ms`);
      e.code = 'TIMEOUT';
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isRetryable(err) {
  // Error sementara yang aman dicoba ulang.
  return ['TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'GATEWAY_5XX'].includes(err.code);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} deps { gateway, store }
 * @param {object} opts { timeoutMs, maxRetries, retryDelayMs }
 */
function createPaymentService(deps, opts = {}) {
  const { gateway, store } = deps;
  const timeoutMs = opts.timeoutMs || 3000;
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : 2; // total percobaan = 1 + maxRetries
  const retryDelayMs = opts.retryDelayMs != null ? opts.retryDelayMs : 100;

  async function confirmPayment(payload) {
    validate(payload);
    const { order_id, amount, payment_method, idempotency_key } = payload;
    log(`confirm order=${order_id} amount=${amount} method=${payment_method || '-'}`);

    // --- IDEMPOTENCY ---
    // 1) Bila idempotency_key sudah pernah dipakai -> kembalikan hasil sebelumnya.
    if (idempotency_key) {
      const prev = store.getByIdempotencyKey(idempotency_key);
      if (prev) {
        log.warn(`idempotent hit (key) order=${prev.order_id} status=${prev.status}`);
        return toResult(prev, true);
      }
    }
    // 2) Bila order_id sudah final (PAID/FAILED) -> jangan proses ulang.
    const existing = store.getByOrderId(order_id);
    if (existing && ['PAID', 'FAILED'].includes(existing.status)) {
      log.warn(`idempotent hit (order_id) order=${order_id} status=${existing.status}`);
      return toResult(existing, true);
    }

    // Catat status awal PENDING.
    store.upsert({ order_id, idempotency_key, amount, payment_method, status: 'PENDING' });

    // --- PANGGIL GATEWAY dengan TIMEOUT + RETRY ---
    let attempt = 0;
    let lastErr;
    while (attempt <= maxRetries) {
      attempt++;
      try {
        const resp = await withTimeout(
          gateway.charge({ order_id, amount, payment_method }),
          timeoutMs,
          'gateway.charge'
        );
        log.ok(`gateway sukses order=${order_id} attempt=${attempt} paid=${resp.paid}`);

        const tx = store.upsert({
          order_id,
          idempotency_key,
          amount,
          payment_method,
          status: resp.paid ? 'PAID' : 'FAILED',
          transaction_id: resp.transaction_id || null,
          reason: resp.paid ? null : resp.reason || resp.code || 'PAYMENT_DECLINED',
        });
        return toResult(tx, false);
      } catch (err) {
        lastErr = err;
        log.warn(`gateway gagal order=${order_id} attempt=${attempt} code=${err.code || err.message}`);
        if (attempt <= maxRetries && isRetryable(err)) {
          await sleep(retryDelayMs * attempt); // backoff sederhana
          continue;
        }
        break;
      }
    }

    // Semua percobaan gagal -> simpan ERROR.
    const tx = store.upsert({
      order_id,
      idempotency_key,
      amount,
      payment_method,
      status: 'ERROR',
      reason: (lastErr && (lastErr.code || lastErr.message)) || 'GATEWAY_ERROR',
    });
    log.error(`order=${order_id} ERROR setelah ${attempt} percobaan: ${tx.reason}`);
    const result = toResult(tx, false);
    result.error = true;
    return result;
  }

  return { confirmPayment };
}

function toResult(tx, replayed) {
  return {
    order_id: tx.order_id,
    status: tx.status,
    transaction_id: tx.transaction_id || null,
    amount: tx.amount,
    reason: tx.reason || null,
    idempotent_replay: !!replayed,
    updated_at: tx.updated_at,
  };
}

module.exports = { createPaymentService, validate, withTimeout, ValidationError, VALID_METHODS };
