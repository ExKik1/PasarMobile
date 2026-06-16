'use strict';

/**
 * Konfigurasi terpusat. Memuat variabel dari file .env (bila ada) memakai
 * fitur bawaan Node.js (process.loadEnvFile, Node >= 20.12 / 22).
 *
 * Tidak butuh package "dotenv". Bila .env tidak ada, dilewati tanpa error.
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
const bool = (v, def = false) => (v == null ? def : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, def) => (v == null || v === '' ? def : parseInt(v, 10));

const config = {
  // ---------- KASUS 1: Pembayaran ----------
  payment: {
    // 'mock'  -> pakai bank-gateway lokal (tanpa kredensial)
    // 'midtrans' -> pakai Midtrans Core API sungguhan (butuh kredensial)
    mode: env.PAYMENT_MODE || 'mock',
    apiPort: int(env.API_PORT, 4002),
    bankPort: int(env.BANK_PORT, 4001),
    midtrans: {
      serverKey: env.MIDTRANS_SERVER_KEY || '',
      clientKey: env.MIDTRANS_CLIENT_KEY || '',
      isProduction: bool(env.MIDTRANS_IS_PRODUCTION, false),
      get baseUrl() {
        return this.isProduction
          ? 'https://api.midtrans.com'
          : 'https://api.sandbox.midtrans.com';
      },
    },
  },

  // ---------- KASUS 2: Laporan batch ----------
  db: {
    // 'sqlite' (default, file lokal) atau 'postgres' (server sungguhan)
    driver: env.DB_DRIVER || 'sqlite',
    postgres: {
      host: env.PGHOST || 'localhost',
      port: int(env.PGPORT, 5432),
      database: env.PGDATABASE || 'pasarmobile',
      user: env.PGUSER || 'postgres',
      password: env.PGPASSWORD || 'postgres',
    },
  },

  // ---------- KASUS 3: Message broker ----------
  broker: {
    // 'memory' (broker lokal bawaan) atau 'rabbitmq' (server sungguhan)
    driver: env.BROKER_DRIVER || 'memory',
    rabbitUrl: env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    queue: env.COURIER_QUEUE || 'courier.status',
    prefetch: int(env.CONSUMER_PREFETCH, 5),
  },
};

module.exports = { config };
