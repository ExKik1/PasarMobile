'use strict';

/**
 * Konfigurasi terpusat (sederhana). Memuat variabel dari file .env bila ada,
 * memakai fitur bawaan Node.js (process.loadEnvFile). Semua punya nilai default,
 * jadi proyek tetap jalan tanpa file .env.
 *
 * Proyek ini SATU MODE LOKAL saja (tanpa layanan eksternal):
 *   - Pembayaran : bank gateway lokal (mock)
 *   - Laporan    : SQLite (file lokal)
 *   - Kurir      : message broker in-memory (lokal)
 */

const path = require('path');
const fs = require('fs');

const ENV_PATH = path.join(process.cwd(), '.env');
if (typeof process.loadEnvFile === 'function' && fs.existsSync(ENV_PATH)) {
  try {
    process.loadEnvFile(ENV_PATH);
  } catch (_) {
    /* abaikan: jalankan dengan default */
  }
}

const env = process.env;
const int = (v, def) => (v == null || v === '' ? def : parseInt(v, 10));

const config = {
  // KASUS 1 - port server
  payment: {
    apiPort: int(env.API_PORT, 4002),
    bankPort: int(env.BANK_PORT, 4001),
  },
  // KASUS 3 - pengaturan broker lokal
  broker: {
    queue: env.COURIER_QUEUE || 'courier.status',
    prefetch: int(env.CONSUMER_PREFETCH, 5),
  },
  // BAGIAN C - port API stock & shipment
  storeApiPort: int(env.STORE_API_PORT, 4003),
};

module.exports = { config };
