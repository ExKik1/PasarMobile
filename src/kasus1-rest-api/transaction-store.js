'use strict';

/**
 * KASUS 1 - PENYIMPANAN TRANSAKSI (SQLite)
 * ----------------------------------------
 * Menyimpan status transaksi pembayaran. Memakai node:sqlite bawaan.
 * Path bisa dikonfigurasi -> gunakan ':memory:' untuk pengujian.
 *
 * Tabel transactions:
 *   order_id (PK), idempotency_key, amount, payment_method,
 *   status (PENDING|PAID|FAILED|ERROR), transaction_id, reason, updated_at
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

class TransactionStore {
  /**
   * @param {string} dbPath path file SQLite, atau ':memory:'
   */
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'data', 'payments.db');
    if (this.dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        order_id        TEXT PRIMARY KEY,
        idempotency_key TEXT,
        amount          INTEGER NOT NULL,
        payment_method  TEXT,
        status          TEXT NOT NULL,
        transaction_id  TEXT,
        reason          TEXT,
        updated_at      TEXT NOT NULL
      );
    `);
  }

  /** Ambil transaksi berdasarkan order_id. */
  getByOrderId(orderId) {
    return this.db.prepare('SELECT * FROM transactions WHERE order_id = ?').get(orderId) || null;
  }

  /** Ambil transaksi berdasarkan idempotency key. */
  getByIdempotencyKey(key) {
    if (!key) return null;
    return this.db.prepare('SELECT * FROM transactions WHERE idempotency_key = ?').get(key) || null;
  }

  /** Simpan / perbarui (upsert) transaksi. */
  upsert(tx) {
    this.db
      .prepare(
        `INSERT INTO transactions
           (order_id, idempotency_key, amount, payment_method, status, transaction_id, reason, updated_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(order_id) DO UPDATE SET
           idempotency_key=excluded.idempotency_key,
           amount=excluded.amount,
           payment_method=excluded.payment_method,
           status=excluded.status,
           transaction_id=excluded.transaction_id,
           reason=excluded.reason,
           updated_at=excluded.updated_at`
      )
      .run(
        tx.order_id,
        tx.idempotency_key || null,
        tx.amount,
        tx.payment_method || null,
        tx.status,
        tx.transaction_id || null,
        tx.reason || null,
        tx.updated_at || new Date().toISOString()
      );
    return this.getByOrderId(tx.order_id);
  }

  close() {
    this.db.close();
  }
}

module.exports = { TransactionStore };
