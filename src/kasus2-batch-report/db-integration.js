'use strict';

/**
 * KASUS 2 - DATABASE INTEGRATION
 * ------------------------------
 * Sistem laporan terhubung LANGSUNG ke database sistem transaksi dan
 * menjalankan query SELECT (agregasi) untuk menyusun laporan bulanan.
 *
 * Cocok bila kedua sistem berada dalam satu infrastruktur: efisien karena
 * agregasi dikerjakan oleh database, bukan ditarik baris per baris.
 *
 * Ini adalah BATCH PROCESSING: memproses seluruh data 1 bulan sekaligus.
 */

const { DatabaseSync } = require('node:sqlite');
const { makeLogger } = require('../shared/logger');
const { DB_PATH } = require('./seed-database');

const log = makeLogger('DB-INTEGRATION', 'blue');

/**
 * Menghasilkan laporan bulanan via query langsung ke DB.
 * @param {string} month format 'YYYY-MM'
 */
function generateMonthlyReport(month) {
  log(`Query langsung ke database untuk laporan bulan ${month} ...`);
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const like = `${month}-%`;

  // Ringkasan keseluruhan (hanya transaksi PAID yang dihitung sebagai pendapatan).
  const summary = db
    .prepare(
      `SELECT
         COUNT(*)                                        AS total_transaksi,
         SUM(CASE WHEN status='PAID' THEN 1 ELSE 0 END)  AS jumlah_paid,
         SUM(CASE WHEN status='PAID' THEN amount ELSE 0 END) AS total_pendapatan,
         SUM(CASE WHEN status='REFUNDED' THEN amount ELSE 0 END) AS total_refund,
         SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS jumlah_gagal
       FROM transactions
       WHERE created_at LIKE ?`
    )
    .get(like);

  // Rincian per kategori (hanya PAID).
  const perCategory = db
    .prepare(
      `SELECT category,
              COUNT(*)    AS jumlah,
              SUM(amount) AS pendapatan
       FROM transactions
       WHERE created_at LIKE ? AND status='PAID'
       GROUP BY category
       ORDER BY pendapatan DESC`
    )
    .all(like);

  db.close();

  const report = {
    period: month,
    method: 'DATABASE_INTEGRATION',
    generated_at: new Date().toISOString(),
    summary,
    per_category: perCategory,
  };
  log.ok(
    `Laporan selesai: ${summary.jumlah_paid} transaksi PAID, ` +
      `pendapatan Rp${(summary.total_pendapatan || 0).toLocaleString('id-ID')}`
  );
  return report;
}

if (require.main === module) {
  const month = process.argv[2] || '2026-06';
  console.log(JSON.stringify(generateMonthlyReport(month), null, 2));
}

module.exports = { generateMonthlyReport };
