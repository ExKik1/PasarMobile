'use strict';

/**
 * KASUS 2 - DATASOURCE (sumber data transaksi)
 * --------------------------------------------
 * Backend: SQLite (file lokal) memakai node:sqlite bawaan. Sederhana, tanpa
 * server database eksternal. Menyediakan API yang dipakai oleh db-integration.js
 * dan file-integration.js.
 */

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { seed: seedSqlite, DB_PATH } = require('./seed-database');

const driver = 'sqlite';

const backend = {
  async ensureSeeded() {
    if (!fs.existsSync(DB_PATH)) seedSqlite();
  },

  async monthlySummary(month) {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const row = db
      .prepare(
        `SELECT
           COUNT(*) AS total_transaksi,
           SUM(CASE WHEN status='PAID' THEN 1 ELSE 0 END) AS jumlah_paid,
           SUM(CASE WHEN status='PAID' THEN amount ELSE 0 END) AS total_pendapatan,
           SUM(CASE WHEN status='REFUNDED' THEN amount ELSE 0 END) AS total_refund,
           SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS jumlah_gagal
         FROM transactions WHERE created_at LIKE ?`
      )
      .get(`${month}-%`);
    db.close();
    return {
      total_transaksi: Number(row.total_transaksi) || 0,
      jumlah_paid: Number(row.jumlah_paid) || 0,
      total_pendapatan: Number(row.total_pendapatan) || 0,
      total_refund: Number(row.total_refund) || 0,
      jumlah_gagal: Number(row.jumlah_gagal) || 0,
    };
  },

  async perCategory(month) {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT category, COUNT(*) AS jumlah, SUM(amount) AS pendapatan
         FROM transactions WHERE created_at LIKE ? AND status='PAID'
         GROUP BY category ORDER BY pendapatan DESC`
      )
      .all(`${month}-%`);
    db.close();
    return rows.map((r) => ({
      category: r.category,
      jumlah: Number(r.jumlah),
      pendapatan: Number(r.pendapatan),
    }));
  },

  async fetchRows(month) {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT order_id, buyer, category, amount, status, created_at
         FROM transactions WHERE created_at LIKE ? ORDER BY created_at`
      )
      .all(`${month}-%`);
    db.close();
    return rows;
  },
};

async function close() {
  /* SQLite ditutup per operasi; tidak ada pool yang perlu ditutup. */
}

module.exports = { backend, driver, close };
