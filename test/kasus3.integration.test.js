'use strict';

/**
 * Test integrasi KASUS 3 - Messaging.  Jalankan: node --test
 *
 * Mempublikasikan beberapa pesan ke broker (in-memory, durable ke folder temp),
 * lalu memverifikasi: semua pesan valid diproses & status DB sesuai, serta
 * pesan beracun masuk ke Dead-Letter Queue.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MessageBroker } = require('../src/kasus3-message-broker/broker');
const { OrderStore } = require('../src/kasus3-message-broker/order-store');
const { startOrderConsumer } = require('../src/kasus3-message-broker/order-consumer');

const QUEUE = 'order.status';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tmpBroker() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k3-'));
  return new MessageBroker({ dataDir: dir });
}

test('semua pesan valid diproses & status DB benar', async () => {
  const broker = tmpBroker();
  const store = new OrderStore(':memory:');
  const stats = startOrderConsumer(broker, store, { prefetch: 2, processingDelayMs: 20 });

  const msgs = [
    { order_id: 'ORD-1', status: 'in_transit', timestamp: '2026-06-16T10:00:00Z' },
    { order_id: 'ORD-2', status: 'delivered', timestamp: '2026-06-16T10:01:00Z' },
    { order_id: 'ORD-1', status: 'delivered', timestamp: '2026-06-16T10:05:00Z' },
    { order_id: 'ORD-3', status: 'failed', timestamp: '2026-06-16T10:02:00Z' },
  ];
  for (const m of msgs) broker.publish(QUEUE, m);

  // tunggu sampai antrian habis
  for (let i = 0; i < 100 && broker.depth(QUEUE) > 0; i++) await sleep(20);
  await sleep(50);

  assert.strictEqual(stats.processed, 4);
  assert.strictEqual(store.get('ORD-1').status, 'delivered'); // update terakhir menang
  assert.strictEqual(store.get('ORD-2').status, 'delivered');
  assert.strictEqual(store.get('ORD-3').status, 'failed');
  assert.strictEqual(store.count(), 3);
  broker.close();
  store.close();
});

test('pesan beracun (status tidak valid) masuk Dead-Letter Queue setelah retry', async () => {
  const broker = tmpBroker();
  const store = new OrderStore(':memory:');
  const stats = startOrderConsumer(broker, store, { prefetch: 1, processingDelayMs: 5, maxAttempts: 3 });

  broker.publish(QUEUE, { order_id: 'ORD-OK', status: 'delivered', timestamp: 't' });
  broker.publish(QUEUE, { order_id: 'ORD-BAD', status: 'planet_mars', timestamp: 't' }); // beracun

  for (let i = 0; i < 100 && broker.depth(QUEUE) > 0; i++) await sleep(10);
  await sleep(50);

  // Yang valid diproses, yang beracun pindah ke DLQ (tidak menyumbat queue utama).
  assert.strictEqual(store.get('ORD-OK').status, 'delivered');
  assert.strictEqual(stats.deadLettered, 1);
  assert.strictEqual(broker.depth('order.status.dlq'), 1, 'pesan beracun ada di DLQ');
  assert.strictEqual(store.get('ORD-BAD'), null, 'pesan beracun tidak masuk orders');
  broker.close();
  store.close();
});

test('durable: pesan tetap ada setelah broker dimuat ulang dari disk', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k3d-'));
  const b1 = new MessageBroker({ dataDir: dir });
  b1.publish(QUEUE, { order_id: 'ORD-D1', status: 'in_transit', timestamp: 't' });
  b1.publish(QUEUE, { order_id: 'ORD-D2', status: 'in_transit', timestamp: 't' });
  b1.close(); // "mati" tanpa ada consumer

  const b2 = new MessageBroker({ dataDir: dir }); // dimuat ulang dari disk
  assert.strictEqual(b2.depth(QUEUE), 2, 'pesan harus pulih dari disk');

  const store = new OrderStore(':memory:');
  startOrderConsumer(b2, store, { prefetch: 5, processingDelayMs: 5 });
  for (let i = 0; i < 100 && b2.depth(QUEUE) > 0; i++) await sleep(10);
  await sleep(30);

  assert.strictEqual(store.count(), 2);
  b2.close();
  store.close();
});
