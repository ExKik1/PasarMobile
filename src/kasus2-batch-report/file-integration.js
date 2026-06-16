'use strict';

/**
 * KASUS 2 - FILE INTEGRATION
 * --------------------------
 * Sistem transaksi MENGEKSPOR data akhir bulan ke file CSV. Sistem laporan
 * yang terpisah kemudian MEMBACA file CSV itu dan memprosesnya. Tidak ada
 * koneksi langsung antar sistem - cukup tukar-menukar file.
 *
 * Cocok bila kedua sistem terpisah / beda infrastruktur / beda vendor.
 * Ini juga BATCH PROCESSING (proses satu file penuh sekaligus).
 */

const path = require('path');
const fs = require('fs');
const { makeLogger } = require('../shared/logger');
const { backend, driver } = require('./datasource');
const { DATA_DIR } = require('./seed-database');

const log = makeLogger('FILE-INTEGRATION', 'yellow');

function csvEscape(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * LANGKAH 1 (sisi sistem transaksi): ekspor transaksi 1 bulan ke file CSV.
 * Mengambil data lewat datasource (SQLite). Mengembalikan path CSV.
 */
async function exportMonthToCsv(month) {
  await backend.ensureSeeded();
  const rows = await backend.fetchRows(month);

  const header = ['order_id', 'buyer', 'category', 'amount', 'status', 'created_at'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map((h) => csvEscape(r[h])).join(','));
  }

  const exportDir = path.join(DATA_DIR, 'exports');
  fs.mkdirSync(exportDir, { recursive: true });
  const csvPath = path.join(exportDir, `transactions-${month}.csv`);
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
  log.ok(`Sistem transaksi (${driver}) mengekspor ${rows.length} baris -> ${path.basename(csvPath)}`);
  return csvPath;
}

/**
 * Parser CSV minimal (mendukung field berkutip).
 */
function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => (obj[h] = cells[idx]));
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * LANGKAH 2 (sisi sistem laporan): baca file CSV dan susun laporan bulanan.
 */
async function generateMonthlyReport(month) {
  const csvPath = await exportMonthToCsv(month);
  log(`Sistem laporan membaca file ${path.basename(csvPath)} ...`);
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);

  const summary = {
    total_transaksi: rows.length,
    jumlah_paid: 0,
    total_pendapatan: 0,
    total_refund: 0,
    jumlah_gagal: 0,
  };
  const catMap = new Map();

  for (const r of rows) {
    const amount = Number(r.amount);
    if (r.status === 'PAID') {
      summary.jumlah_paid++;
      summary.total_pendapatan += amount;
      const c = catMap.get(r.category) || { category: r.category, jumlah: 0, pendapatan: 0 };
      c.jumlah++;
      c.pendapatan += amount;
      catMap.set(r.category, c);
    } else if (r.status === 'REFUNDED') {
      summary.total_refund += amount;
    } else if (r.status === 'FAILED') {
      summary.jumlah_gagal++;
    }
  }

  const perCategory = [...catMap.values()].sort((a, b) => b.pendapatan - a.pendapatan);
  const report = {
    period: month,
    method: 'FILE_INTEGRATION',
    source_file: path.basename(csvPath),
    generated_at: new Date().toISOString(),
    summary,
    per_category: perCategory,
  };
  log.ok(
    `Laporan selesai dari file: ${summary.jumlah_paid} transaksi PAID, ` +
      `pendapatan Rp${summary.total_pendapatan.toLocaleString('id-ID')}`
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

module.exports = { generateMonthlyReport, exportMonthToCsv, parseCsv };
