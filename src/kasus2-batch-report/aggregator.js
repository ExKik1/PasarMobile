'use strict';

/**
 * KASUS 2 - AGGREGATOR
 * --------------------
 * Menghitung agregasi laporan dari kumpulan baris transaksi:
 *   - total per JENIS (type)  -> disimpan ke tabel monthly_summary
 *   - total per HARI (date)   -> dikembalikan untuk pelaporan tambahan
 *
 * Bisa menerima baris langsung (untuk uji) atau membaca dari file CSV.
 * Penanganan error: file tidak ditemukan, format kolom salah.
 */

const fs = require('fs');
const { makeLogger } = require('../shared/logger');
const { parseCsv } = require('./file-integration');

const log = makeLogger('AGGREGATOR', 'yellow');

const REQUIRED_COLUMNS = ['date', 'amount', 'type'];

/**
 * Agregasi dari array baris. Setiap baris minimal punya { date, amount, type }.
 * @param {string} month 'YYYY-MM'
 * @param {Array<object>} rows
 * @returns {{ month, per_type, per_day, total_amount, total_count }}
 */
function aggregate(month, rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows harus array');

  const typeMap = new Map();
  const dayMap = new Map();
  let totalAmount = 0;

  rows.forEach((r, idx) => {
    // Validasi format kolom.
    for (const col of REQUIRED_COLUMNS) {
      if (r[col] == null || r[col] === '') {
        const e = new Error(`Format CSV salah: kolom "${col}" kosong di baris ke-${idx + 1}`);
        e.code = 'BAD_FORMAT';
        throw e;
      }
    }
    const amount = Number(r.amount);
    if (Number.isNaN(amount)) {
      const e = new Error(`Format CSV salah: amount bukan angka di baris ke-${idx + 1}`);
      e.code = 'BAD_FORMAT';
      throw e;
    }

    totalAmount += amount;

    const t = typeMap.get(r.type) || { type: r.type, total_amount: 0, count: 0 };
    t.total_amount += amount;
    t.count += 1;
    typeMap.set(r.type, t);

    const day = String(r.date).slice(0, 10); // ambil bagian YYYY-MM-DD
    const d = dayMap.get(day) || { date: day, total_amount: 0, count: 0 };
    d.total_amount += amount;
    d.count += 1;
    dayMap.set(day, d);
  });

  const per_type = [...typeMap.values()].sort((a, b) => b.total_amount - a.total_amount);
  const per_day = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  log(`agregasi ${month}: ${rows.length} baris, ${per_type.length} jenis, ${per_day.length} hari`);
  return { month, per_type, per_day, total_amount: totalAmount, total_count: rows.length };
}

/**
 * Baca file CSV lalu agregasi. Melempar error bila file tidak ditemukan.
 */
function aggregateFromCsv(month, csvPath) {
  if (!fs.existsSync(csvPath)) {
    const e = new Error(`File tidak ditemukan: ${csvPath}`);
    e.code = 'FILE_NOT_FOUND';
    throw e;
  }
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  return aggregate(month, rows);
}

/**
 * Agregasi + simpan ke report DB secara idempoten (per bulan).
 * @param {ReportStore} store
 */
function aggregateAndSave(store, month, rows, { force = false } = {}) {
  if (!force && store.hasMonth(month)) {
    log.warn(`bulan ${month} sudah ada di report DB -> dilewati (idempoten). Pakai force=true utk timpa.`);
    return { skipped: true, saved: store.getMonth(month) };
  }
  const agg = aggregate(month, rows);
  const saved = store.saveMonth(month, agg.per_type);
  log.ok(`tersimpan ke monthly_summary: ${saved.length} baris untuk bulan ${month}`);
  return { skipped: false, aggregation: agg, saved };
}

module.exports = { aggregate, aggregateFromCsv, aggregateAndSave, REQUIRED_COLUMNS };
