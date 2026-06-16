'use strict';

/**
 * Unit test KASUS 1 - Payment Service.
 * Dijalankan dengan test runner bawaan Node:  node --test
 *
 * Memakai store SQLite in-memory (':memory:') dan gateway TIRUAN yang
 * disuntikkan, sehingga skenario sukses/gagal/timeout bisa dikontrol penuh.
 */

const test = require('node:test');
const assert = require('node:assert');
const { TransactionStore } = require('../src/kasus1-rest-api/transaction-store');
const { createPaymentService, ValidationError } = require('../src/kasus1-rest-api/payment-service');

function freshStore() {
  return new TransactionStore(':memory:');
}

test('sukses: pembayaran disetujui gateway -> status PAID & tersimpan', async () => {
  const store = freshStore();
  const gateway = {
    charge: async () => ({ paid: true, transaction_id: 'TRX-1' }),
  };
  const svc = createPaymentService({ gateway, store });
  const res = await svc.confirmPayment({ order_id: 'O1', amount: 1000, payment_method: 'qris' });

  assert.strictEqual(res.status, 'PAID');
  assert.strictEqual(res.transaction_id, 'TRX-1');
  assert.strictEqual(store.getByOrderId('O1').status, 'PAID');
  store.close();
});

test('gagal: gateway menolak -> status FAILED dengan alasan', async () => {
  const store = freshStore();
  const gateway = {
    charge: async () => ({ paid: false, reason: 'INSUFFICIENT_FUNDS' }),
  };
  const svc = createPaymentService({ gateway, store });
  const res = await svc.confirmPayment({ order_id: 'O2', amount: 5000 });

  assert.strictEqual(res.status, 'FAILED');
  assert.strictEqual(res.reason, 'INSUFFICIENT_FUNDS');
  store.close();
});

test('timeout + retry: gateway lambat melebihi timeout, dicoba ulang lalu menyerah -> ERROR', async () => {
  const store = freshStore();
  let calls = 0;
  const gateway = {
    charge: () => {
      calls++;
      // selalu lebih lambat dari timeout -> memicu TIMEOUT
      return new Promise((resolve) => setTimeout(() => resolve({ paid: true }), 500));
    },
  };
  const svc = createPaymentService({ gateway, store }, { timeoutMs: 50, maxRetries: 2, retryDelayMs: 10 });
  const res = await svc.confirmPayment({ order_id: 'O3', amount: 1000 });

  assert.strictEqual(res.status, 'ERROR');
  assert.strictEqual(res.error, true);
  assert.strictEqual(calls, 3, 'harus 1 percobaan awal + 2 retry');
  store.close();
});

test('retry sukses: gagal sementara di percobaan pertama, sukses di percobaan kedua', async () => {
  const store = freshStore();
  let calls = 0;
  const gateway = {
    charge: async () => {
      calls++;
      if (calls === 1) {
        const e = new Error('gateway 5xx');
        e.code = 'GATEWAY_5XX';
        throw e;
      }
      return { paid: true, transaction_id: 'TRX-RETRY' };
    },
  };
  const svc = createPaymentService({ gateway, store }, { maxRetries: 2, retryDelayMs: 10 });
  const res = await svc.confirmPayment({ order_id: 'O4', amount: 2000 });

  assert.strictEqual(res.status, 'PAID');
  assert.strictEqual(calls, 2);
  store.close();
});

test('validasi: order_id kosong & amount tidak valid -> ValidationError', async () => {
  const store = freshStore();
  const svc = createPaymentService({ gateway: { charge: async () => ({}) }, store });
  await assert.rejects(() => svc.confirmPayment({ amount: -10 }), ValidationError);
  await assert.rejects(() => svc.confirmPayment({ order_id: 'X' }), ValidationError);
  store.close();
});

test('idempotency (key): request kedua dengan key sama tidak memanggil gateway lagi', async () => {
  const store = freshStore();
  let calls = 0;
  const gateway = {
    charge: async () => {
      calls++;
      return { paid: true, transaction_id: 'TRX-IDEM' };
    },
  };
  const svc = createPaymentService({ gateway, store });
  const p = { order_id: 'O5', amount: 1000, idempotency_key: 'key-123' };

  const r1 = await svc.confirmPayment(p);
  const r2 = await svc.confirmPayment(p);

  assert.strictEqual(r1.status, 'PAID');
  assert.strictEqual(r2.status, 'PAID');
  assert.strictEqual(r2.idempotent_replay, true);
  assert.strictEqual(calls, 1, 'gateway hanya dipanggil sekali');
  store.close();
});

test('idempotency (order_id final): order PAID tidak diproses ulang', async () => {
  const store = freshStore();
  let calls = 0;
  const gateway = { charge: async () => (calls++, { paid: true, transaction_id: 'T' }) };
  const svc = createPaymentService({ gateway, store });

  await svc.confirmPayment({ order_id: 'O6', amount: 1000 });
  const again = await svc.confirmPayment({ order_id: 'O6', amount: 1000 });

  assert.strictEqual(again.idempotent_replay, true);
  assert.strictEqual(calls, 1);
  store.close();
});
