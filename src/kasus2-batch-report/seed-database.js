'use strict';

/**
 * KASUS 2 - File + Database Integration (Batch Processing)
 * --------------------------------------------------------
 * SEEDER: membuat "database sistem transaksi" PasarMobile menggunakan
 * SQLite bawaan Node.js (node:sqlite). Mengisi data transaksi contoh
 * untuk beberapa bulan agar laporan batch bulanan bisa dihitung.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('SEED-DB', 'blue');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'transactions.db');

const CATEGORIES = ['Elektronik', 'Fashion', 'Makanan', 'Rumah Tangga', 'Olahraga'];
const USERS = ['Budi', 'Sari', 'Andi', 'Maya', 'Joko', 'Rina'];

function seed() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Mulai dari database bersih agar hasil demo konsisten.
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id     TEXT NOT NULL,
      buyer        TEXT NOT NULL,
      category     TEXT NOT NULL,
      amount       INTEGER NOT NULL,
      status       TEXT NOT NULL,          -- PAID | REFUNDED | FAILED
      created_at   TEXT NOT NULL           -- ISO timestamp
    );
  `);

  const insert = db.prepare(
    `INSERT INTO transactions (order_id, buyer, category, amount, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  // Deterministic PRNG sederhana supaya data seed selalu sama tiap dijalankan.
  let seedState = 12345;
  const rand = () => {
    seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
    return seedState / 0x7fffffff;
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // Buat data untuk 2 bulan: Mei 2026 dan Juni 2026.
  const months = ['2026-05', '2026-06'];
  let counter = 1000;
  let total = 0;

  for (const month of months) {
    const txCount = 60 + Math.floor(rand() * 20); // ~60-80 transaksi/bulan
    for (let i = 0; i < txCount; i++) {
      const day = String(1 + Math.floor(rand() * 27)).padStart(2, '0');
      const hour = String(Math.floor(rand() * 24)).padStart(2, '0');
      const min = String(Math.floor(rand() * 60)).padStart(2, '0');
      const amount = (5 + Math.floor(rand() * 200)) * 1000; // Rp5.000 - Rp205.000
      const r = rand();
      const status = r < 0.85 ? 'PAID' : r < 0.93 ? 'REFUNDED' : 'FAILED';
      insert.run(
        `ORD-${counter++}`,
        pick(USERS),
        pick(CATEGORIES),
        amount,
        status,
        `${month}-${day}T${hour}:${min}:00.000Z`
      );
      total++;
    }
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM transactions').get();
  db.close();
  log.ok(`Database transaksi dibuat: ${DB_PATH}`);
  log(`Total ${count.c} transaksi (bulan: ${months.join(', ')})`);
  return { DB_PATH, total };
}

if (require.main === module) {
  seed();
}

module.exports = { seed, DB_PATH, DATA_DIR };
