'use strict';

/**
 * KASUS 2 - DATABASE LAPORAN (report DB)
 * --------------------------------------
 * Menyimpan hasil agregasi bulanan. Memakai node:sqlite bawaan.
 * Path bisa dikonfigurasi (':memory:' untuk pengujian).
 *
 * Tabel monthly_summary:
 *   month (YYYY-MM), type, total_amount, count   [PK: (month, type)]
 *
 * Idempotency berbasis BULAN: menyimpan ulang bulan yang sama akan menimpa
 * baris bulan tsb (hapus lalu insert), sehingga tidak ada duplikasi data.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

class ReportStore {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'data', 'reports.db');
    if (this.dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monthly_summary (
        month        TEXT NOT NULL,
        type         TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        count        INTEGER NOT NULL,
        PRIMARY KEY (month, type)
      );
    `);
  }

  /**
   * Simpan agregasi per-jenis untuk satu bulan secara IDEMPOTEN.
   * @param {string} month 'YYYY-MM'
   * @param {Array<{type, total_amount, count}>} perType
   */
  saveMonth(month, perType) {
    const del = this.db.prepare('DELETE FROM monthly_summary WHERE month = ?');
    const ins = this.db.prepare(
      'INSERT INTO monthly_summary (month, type, total_amount, count) VALUES (?,?,?,?)'
    );
    // Transaksi agar atomik (hapus + insert sekaligus).
    this.db.exec('BEGIN');
    try {
      del.run(month);
      for (const r of perType) {
        ins.run(month, r.type, r.total_amount, r.count);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.getMonth(month);
  }

  getMonth(month) {
    return this.db
      .prepare('SELECT month, type, total_amount, count FROM monthly_summary WHERE month = ? ORDER BY type')
      .all(month);
  }

  hasMonth(month) {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM monthly_summary WHERE month = ?').get(month);
    return row.c > 0;
  }

  close() {
    this.db.close();
  }
}

module.exports = { ReportStore };
