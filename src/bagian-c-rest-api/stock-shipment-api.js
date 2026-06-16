'use strict';

/**
 * BAGIAN C - DESAIN RESTful API (implementasi sederhana, format JSON)
 * ------------------------------------------------------------------
 * Dua endpoint sesuai soal:
 *   1) GET  /api/stock/{id}  -> cek stok barang ke "sistem Gudang"   (Success/Fail)
 *   2) POST /api/shipment    -> kirim data pengiriman ke "sistem Kurir" (Customer Data)
 *
 * Memakai modul http bawaan Node.js (tanpa Express) agar tetap ringan.
 * Data gudang & pengiriman disimpan in-memory untuk kesederhanaan.
 */

const http = require('http');
const { makeLogger } = require('../shared/logger');

const log = makeLogger('STOCK-SHIPMENT-API', 'green');
const PORT = process.env.STORE_API_PORT || 4003;

// --- "Database" gudang (in-memory) ---
const WAREHOUSE = {
  'PRD-001': { name: 'Kaos Polos', stock: 25, warehouse: 'JKT-01' },
  'PRD-002': { name: 'Sepatu Lari', stock: 0, warehouse: 'BDG-02' },
  'PRD-003': { name: 'Tas Ransel', stock: 8, warehouse: 'JKT-01' },
};

// Penyimpanan pengiriman yang sudah dibuat.
const shipments = new Map();
let shipmentSeq = 1000;

// ============================================================
// Handler 1: Check Stock  (GET /api/stock/{id})
// ============================================================
function handleCheckStock(id) {
  const product = WAREHOUSE[id];
  if (!product) {
    // FAIL: produk tidak ditemukan
    return {
      status: 404,
      body: {
        status: 'fail',
        message: `Produk dengan id ${id} tidak ditemukan`,
        data: null,
      },
    };
  }
  // SUCCESS
  return {
    status: 200,
    body: {
      status: 'success',
      message: 'Stok berhasil dicek',
      data: {
        product_id: id,
        name: product.name,
        available_stock: product.stock,
        in_stock: product.stock > 0,
        warehouse: product.warehouse,
      },
    },
  };
}

// ============================================================
// Handler 2: Post Shipment  (POST /api/shipment)
// ============================================================
function handlePostShipment(body) {
  // Validasi data pelanggan (Customer Data).
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('body JSON tidak valid');
  const { order_id, customer, items, courier } = body || {};
  if (!order_id) errors.push('order_id wajib diisi');
  if (!customer || !customer.name) errors.push('customer.name wajib diisi');
  if (!customer || !customer.address) errors.push('customer.address wajib diisi');
  if (!Array.isArray(items) || items.length === 0) errors.push('items minimal 1');

  if (errors.length) {
    return {
      status: 400,
      body: { status: 'fail', message: errors.join('; '), data: null },
    };
  }

  // Buat data pengiriman & "kirim ke sistem kurir".
  const shipmentId = 'SHP-' + ++shipmentSeq;
  const trackingNumber = (courier || 'KURIR').toUpperCase() + '-' + Date.now();
  const shipment = {
    shipment_id: shipmentId,
    tracking_number: trackingNumber,
    order_id,
    courier: courier || 'KURIR-DEFAULT',
    customer,
    items,
    status: 'SHIPMENT_CREATED',
    created_at: new Date().toISOString(),
  };
  shipments.set(shipmentId, shipment);

  return {
    status: 201,
    body: {
      status: 'success',
      message: 'Data pengiriman berhasil dikirim ke sistem kurir',
      data: {
        shipment_id: shipmentId,
        tracking_number: trackingNumber,
        order_id,
        courier: shipment.courier,
        status: shipment.status,
        created_at: shipment.created_at,
      },
    },
  };
}

// ============================================================
// Router sederhana (mendukung path param /api/stock/{id})
// ============================================================
function routeRequest(method, urlPath, body) {
  if (method === 'GET' && urlPath === '/health') {
    return { status: 200, body: { status: 'UP', service: 'stock-shipment-api' } };
  }

  const stockMatch = urlPath.match(/^\/api\/stock\/([^/]+)$/);
  if (method === 'GET' && stockMatch) {
    return handleCheckStock(decodeURIComponent(stockMatch[1]));
  }

  if (method === 'POST' && urlPath === '/api/shipment') {
    return handlePostShipment(body);
  }

  return { status: 404, body: { status: 'fail', message: 'Endpoint tidak ditemukan', data: null } };
}

// ============================================================
// HTTP server
// ============================================================
function createServer() {
  return http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const urlPath = req.url.split('?')[0];
      let body = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch (_) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'fail', message: 'JSON tidak valid', data: null }));
        }
      }
      const result = routeRequest(req.method, urlPath, body);
      log(`${req.method} ${urlPath} -> ${result.status} (${result.body.status})`);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
    });
  });
}

const server = createServer();

if (require.main === module) {
  server.listen(PORT, () => {
    log(`Stock & Shipment API berjalan di http://127.0.0.1:${PORT}`);
    log('Coba: GET /api/stock/PRD-001  |  POST /api/shipment');
  });
}

module.exports = { server, createServer, routeRequest, handleCheckStock, handlePostShipment, PORT };
