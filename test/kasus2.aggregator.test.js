'use strict';

/**
 * Unit test KASUS 2 - Aggregator & Report DB.  Jalankan: node --test
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { aggregate, aggregateFromCsv, aggregateAndSave } = require('../src/kasus2-batch-report/aggregator');
const { ReportStore } = require('../src/kasus2-batch-report/report-store');

// Data dummy: 2 jenis (TOPUP, BELANJA), 2 hari.
const DUMMY = [
  { date: '2026-05-01T08:00:00Z', amount: '10000', type: 'TOPUP' },
  { date: '2026-05-01T09:00:00Z', amount: '5000', type: 'BELANJA' },
  { date: '2026-05-02T10:00:00Z', amount: '20000', type: 'TOPUP' },
  { date: '2026-05-02T11:00:00Z', amount: '15000', type: 'BELANJA' },
];

test('agregasi per jenis benar', () => {
  const agg = aggregate('2026-05', DUMMY);
  const topup = agg.per_type.find((t) => t.type === 'TOPUP');
  const belanja = agg.per_type.find((t) => t.type === 'BELANJA');
  assert.strictEqual(topup.total_amount, 30000);
  assert.strictEqual(topup.count, 2);
  assert.strictEqual(belanja.total_amount, 20000);
  assert.strictEqual(belanja.count, 2);
  assert.strictEqual(agg.total_amount, 50000);
  assert.strictEqual(agg.total_count, 4);
});

test('agregasi per hari benar', () => {
  const agg = aggregate('2026-05', DUMMY);
  assert.strictEqual(agg.per_day.length, 2);
  assert.strictEqual(agg.per_day[0].date, '2026-05-01');
  assert.strictEqual(agg.per_day[0].total_amount, 15000);
  assert.strictEqual(agg.per_day[1].total_amount, 35000);
});

test('format salah: kolom amount bukan angka -> error BAD_FORMAT', () => {
  const bad = [{ date: '2026-05-01', amount: 'abc', type: 'TOPUP' }];
  assert.throws(() => aggregate('2026-05', bad), (e) => e.code === 'BAD_FORMAT');
});

test('format salah: kolom wajib kosong -> error BAD_FORMAT', () => {
  const bad = [{ date: '2026-05-01', amount: '1000', type: '' }];
  assert.throws(() => aggregate('2026-05', bad), (e) => e.code === 'BAD_FORMAT');
});

test('file tidak ditemukan -> error FILE_NOT_FOUND', () => {
  assert.throws(
    () => aggregateFromCsv('2026-05', '/path/yang/tidak/ada.csv'),
    (e) => e.code === 'FILE_NOT_FOUND'
  );
});

test('baca CSV nyata lalu agregasi', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k2-'));
  const csvPath = path.join(dir, 'tx.csv');
  fs.writeFileSync(
    csvPath,
    'date,amount,type\n2026-05-01,10000,TOPUP\n2026-05-01,5000,BELANJA\n'
  );
  const agg = aggregateFromCsv('2026-05', csvPath);
  assert.strictEqual(agg.total_amount, 15000);
  assert.strictEqual(agg.per_type.length, 2);
});

test('idempotency per bulan: simpan dua kali tidak menggandakan baris', () => {
  const store = new ReportStore(':memory:');
  const first = aggregateAndSave(store, '2026-05', DUMMY);
  assert.strictEqual(first.skipped, false);
  assert.strictEqual(store.getMonth('2026-05').length, 2);

  // Simpan lagi -> dilewati (idempoten), jumlah baris tetap.
  const second = aggregateAndSave(store, '2026-05', DUMMY);
  assert.strictEqual(second.skipped, true);
  assert.strictEqual(store.getMonth('2026-05').length, 2);

  // force=true -> menimpa, tetap 2 baris (bukan 4).
  const forced = aggregateAndSave(store, '2026-05', DUMMY, { force: true });
  assert.strictEqual(forced.skipped, false);
  assert.strictEqual(store.getMonth('2026-05').length, 2);
  store.close();
});
