'use strict';

/**
 * KASUS 2 - DEMO BATCH REPORT
 * Menjalankan kedua metode (Database Integration & File Integration) untuk
 * bulan yang sama, lalu membandingkan hasilnya (harus identik) dan menyimpan
 * laporan akhir ke file.
 */

const path = require('path');
const fs = require('fs');
const { makeLogger } = require('../shared/logger');
const { config } = require('../shared/config');
const datasource = require('./datasource');
const dbIntegration = require('./db-integration');
const fileIntegration = require('./file-integration');
const { DATA_DIR } = require('./seed-database');

const log = makeLogger('BATCH-REPORT', 'blue');

function formatRupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

function printReport(report) {
  const s = report.summary;
  console.log(`\n  Metode      : ${report.method}`);
  if (report.source_file) console.log(`  Sumber file : ${report.source_file}`);
  console.log(`  Periode     : ${report.period}`);
  console.log(`  Total transaksi : ${s.total_transaksi}`);
  console.log(`  Transaksi PAID  : ${s.jumlah_paid}`);
  console.log(`  Total pendapatan: ${formatRupiah(s.total_pendapatan)}`);
  console.log(`  Total refund    : ${formatRupiah(s.total_refund)}`);
  console.log(`  Transaksi gagal : ${s.jumlah_gagal}`);
  console.log('  Pendapatan per kategori:');
  for (const c of report.per_category) {
    console.log(`    - ${c.category.padEnd(14)} ${String(c.jumlah).padStart(3)} trx  ${formatRupiah(c.pendapatan)}`);
  }
}

async function main() {
  const month = process.argv[2] || '2026-06';
  console.log('\n=== KASUS 2: File + Database Integration - Laporan Batch Bulanan ===\n');
  log(`Backend database aktif: SQLITE`);

  // Pastikan ada data (SQLite: seed file bila belum ada).
  await datasource.backend.ensureSeeded();

  // --- Metode A: Database Integration (query langsung) ---
  console.log('\n--- Metode A: DATABASE INTEGRATION (query SELECT langsung ke DB) ---');
  const dbReport = await dbIntegration.generateMonthlyReport(month);
  printReport(dbReport);

  // --- Metode B: File Integration (ekspor CSV lalu baca file) ---
  console.log('\n--- Metode B: FILE INTEGRATION (ekspor CSV lalu proses file) ---');
  const fileReport = await fileIntegration.generateMonthlyReport(month);
  printReport(fileReport);

  // --- Verifikasi: kedua metode harus menghasilkan angka yang sama ---
  const same =
    dbReport.summary.jumlah_paid === fileReport.summary.jumlah_paid &&
    dbReport.summary.total_pendapatan === fileReport.summary.total_pendapatan;
  console.log('');
  if (same) {
    log.ok('VERIFIKASI: hasil Database Integration == File Integration (konsisten).');
  } else {
    log.error('VERIFIKASI GAGAL: hasil kedua metode berbeda!');
  }

  // Simpan laporan akhir ke file (JSON + CSV ringkasan).
  const reportDir = path.join(DATA_DIR, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `laporan-${month}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ db: dbReport, file: fileReport }, null, 2));

  const csvLines = ['kategori,jumlah_transaksi,pendapatan'];
  for (const c of dbReport.per_category) {
    csvLines.push(`${c.category},${c.jumlah},${c.pendapatan}`);
  }
  const csvPath = path.join(reportDir, `laporan-${month}.csv`);
  fs.writeFileSync(csvPath, csvLines.join('\n'));

  log.ok(`Laporan disimpan: ${path.relative(process.cwd(), jsonPath)}`);
  log.ok(`Ringkasan CSV   : ${path.relative(process.cwd(), csvPath)}`);
  console.log('\nKesimpulan: laporan bulanan diproses sekali (batch), tidak real-time.');
  console.log('File Integration cocok untuk sistem terpisah; Database Integration');
  console.log('cocok bila satu infrastruktur. Keduanya memproses data besar sekaligus.\n');

  await datasource.close();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { main };
