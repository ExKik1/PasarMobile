'use strict';

/**
 * KASUS 3 - PENYIMPANAN PESANAN (orders)
 * --------------------------------------
 * Diperbarui oleh consumer saat menerima status pengiriman. node:sqlite bawaan.
 *
 * Tabel orders: id (PK), status, updated_at
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

class OrderStore {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'data', 'orders.db');
    if (this.dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id         TEXT PRIMARY KEY,
        status     TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /** Upsert status pesanan. */
  updateStatus(orderId, status, updatedAt) {
    this.db
      .prepare(
        `INSERT INTO orders (id, status, updated_at) VALUES (?,?,?)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at`
      )
      .run(orderId, status, updatedAt || new Date().toISOString());
    return this.get(orderId);
  }

  get(orderId) {
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) || null;
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  }

  close() {
    this.db.close();
  }
}

module.exports = { OrderStore };
