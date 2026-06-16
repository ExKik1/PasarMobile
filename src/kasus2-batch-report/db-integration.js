'use strict';

/**
 * KASUS 2 - DATABASE INTEGRATION
 * ------------------------------
 * Sistem laporan terhubung LANGSUNG ke database transaksi dan menjalankan
 * query agregasi (di sisi DB) untuk menyusun laporan bulanan.
 *
 * Backend: SQLite (file lokal) lewat modul datasource. Ini adalah BATCH PROCESSING: 1 bulan sekaligus.
 */

const { makeLogger } = require('../shared/logger');
const { backend, driver } = require('./datasource');

const log = makeLogger('DB-INTEGRATION', 'blue');

async function generateMonthlyReport(month) {
  log(`Query agregasi langsung ke database (${driver}) untuk bulan ${month} ...`);
  await backend.ensureSeeded();

  const summary = await backend.monthlySummary(month);
  const perCategory = await backend.perCategory(month);

  const report = {
    period: month,
    method: 'DATABASE_INTEGRATION',
    driver,
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
  generateMonthlyReport(month)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .then(() => require('./datasource').close())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { generateMonthlyReport };
