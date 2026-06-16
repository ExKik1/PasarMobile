'use strict';

/**
 * Test BAGIAN C - Desain RESTful API.  Jalankan: node --test
 */

const test = require('node:test');
const assert = require('node:assert');
const { routeRequest } = require('../src/bagian-c-rest-api/stock-shipment-api');

test('GET /api/stock/{id} - SUCCESS untuk produk yang ada', () => {
  const res = routeRequest('GET', '/api/stock/PRD-001', null);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'success');
  assert.strictEqual(res.body.data.product_id, 'PRD-001');
  assert.strictEqual(res.body.data.in_stock, true);
});

test('GET /api/stock/{id} - in_stock=false bila stok 0', () => {
  const res = routeRequest('GET', '/api/stock/PRD-002', null);
  assert.strictEqual(res.body.data.available_stock, 0);
  assert.strictEqual(res.body.data.in_stock, false);
});

test('GET /api/stock/{id} - FAIL untuk produk tidak ada', () => {
  const res = routeRequest('GET', '/api/stock/PRD-999', null);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.status, 'fail');
  assert.strictEqual(res.body.data, null);
});

test('POST /api/shipment - SUCCESS dengan data lengkap', () => {
  const body = {
    order_id: 'ORD-1001',
    courier: 'JNE',
    customer: { name: 'Budi', phone: '08123', address: 'Jl. Merdeka 10', city: 'Jakarta', postal_code: '12345' },
    items: [{ product_id: 'PRD-001', qty: 2 }],
  };
  const res = routeRequest('POST', '/api/shipment', body);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.status, 'success');
  assert.ok(res.body.data.shipment_id.startsWith('SHP-'));
  assert.ok(res.body.data.tracking_number.startsWith('JNE-'));
  assert.strictEqual(res.body.data.order_id, 'ORD-1001');
});

test('POST /api/shipment - FAIL bila data pelanggan kurang', () => {
  const res = routeRequest('POST', '/api/shipment', { order_id: 'ORD-X' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.status, 'fail');
});

test('endpoint tidak dikenal -> 404 fail', () => {
  const res = routeRequest('GET', '/api/unknown', null);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.status, 'fail');
});
