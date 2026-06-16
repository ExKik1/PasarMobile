'use strict';

/**
 * KASUS 2 - DATASOURCE (abstraksi sumber data transaksi)
 * ------------------------------------------------------
 * Mendukung dua backend nyata, dipilih lewat .env (DB_DRIVER):
 *   - 'sqlite'   : database file lokal (node:sqlite bawaan). Default.
 *   - 'postgres' : server PostgreSQL sungguhan (butuh package 'pg').
 *
 * Kedua backend menyediakan API yang sama sehingga db-integration.js dan
 * file-integration.js tidak perlu tahu backend mana yang dipakai.
 */

const { DatabaseSync } = require('node:sqlite');
const { config } = require('../shared/config');
const { makeLogger } = require('../shared/logger');
const { seed: seedSqlite, generateSeedRows, DB_PATH } = require('./seed-database');

const log = makeLogger('DATASOURCE', 'blue');
const DRIVER = config.db.driver;

// ---------------------------------------------------------------------------
// Backend SQLite
// ---------------------------------------------------------------------------
const sqliteBackend = {
  async ensureSeeded() {
    const fs = require('fs');
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
    return normalizeSummary(row);
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
    return rows.map((r) => ({ category: r.category, jumlah: Number(r.jumlah), pendapatan: Number(r.pendapatan) }));
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

// ---------------------------------------------------------------------------
// Backend PostgreSQL (lazy require 'pg' - hanya bila DB_DRIVER=postgres)
// ---------------------------------------------------------------------------
function getPg() {
  try {
    return require('pg');
  } catch (_) {
    throw new Error(
      "Package 'pg' belum terpasang. Jalankan: npm install pg  (untuk DB_DRIVER=postgres)"
    );
  }
}

let _pool = null;
function pool() {
  if (_pool) return _pool;
  const { Pool } = getPg();
  _pool = new Pool(config.db.postgres);
  return _pool;
}

const postgresBackend = {
  async ensureSeeded() {
    const p = pool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id          SERIAL PRIMARY KEY,
        order_id    TEXT NOT NULL,
        buyer       TEXT NOT NULL,
        category    TEXT NOT NULL,
        amount      BIGINT NOT NULL,
        status      TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL
      );
    `);
    const { rows } = await p.query('SELECT COUNT(*)::int AS c FROM transactions');
    if (rows[0].c > 0) return; // sudah ada data

    const { rows: seedRows } = generateSeedRows();
    // Insert batch sederhana.
    for (const t of seedRows) {
      await p.query(
        `INSERT INTO transactions (order_id, buyer, category, amount, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.order_id, t.buyer, t.category, t.amount, t.status, t.created_at]
      );
    }
    log.ok(`PostgreSQL di-seed dengan ${seedRows.length} transaksi`);
  },
  async monthlySummary(month) {
    const p = pool();
    const { rows } = await p.query(
      `SELECT
         COUNT(*) AS total_transaksi,
         COUNT(*) FILTER (WHERE status='PAID') AS jumlah_paid,
         COALESCE(SUM(amount) FILTER (WHERE status='PAID'),0) AS total_pendapatan,
         COALESCE(SUM(amount) FILTER (WHERE status='REFUNDED'),0) AS total_refund,
         COUNT(*) FILTER (WHERE status='FAILED') AS jumlah_gagal
       FROM transactions
       WHERE to_char(created_at,'YYYY-MM') = $1`,
      [month]
    );
    return normalizeSummary(rows[0]);
  },
  async perCategory(month) {
    const p = pool();
    const { rows } = await p.query(
      `SELECT category, COUNT(*) AS jumlah, SUM(amount) AS pendapatan
       FROM transactions
       WHERE to_char(created_at,'YYYY-MM') = $1 AND status='PAID'
       GROUP BY category ORDER BY pendapatan DESC`,
      [month]
    );
    return rows.map((r) => ({ category: r.category, jumlah: Number(r.jumlah), pendapatan: Number(r.pendapatan) }));
  },
  async fetchRows(month) {
    const p = pool();
    const { rows } = await p.query(
      `SELECT order_id, buyer, category, amount, status,
              to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM transactions
       WHERE to_char(created_at,'YYYY-MM') = $1
       ORDER BY created_at`,
      [month]
    );
    return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  },
};

function normalizeSummary(row) {
  return {
    total_transaksi: Number(row.total_transaksi) || 0,
    jumlah_paid: Number(row.jumlah_paid) || 0,
    total_pendapatan: Number(row.total_pendapatan) || 0,
    total_refund: Number(row.total_refund) || 0,
    jumlah_gagal: Number(row.jumlah_gagal) || 0,
  };
}

const backend = DRIVER === 'postgres' ? postgresBackend : sqliteBackend;

async function close() {
  if (_pool) await _pool.end();
}

module.exports = { backend, driver: DRIVER, close };
