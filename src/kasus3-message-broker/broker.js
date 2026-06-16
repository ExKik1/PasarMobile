'use strict';

/**
 * KASUS 3 - Messaging Integration (Message Broker)
 * ------------------------------------------------
 * Implementasi Message Broker sederhana ala RabbitMQ menggunakan modul
 * bawaan Node.js (tanpa server eksternal). Mendemonstrasikan konsep inti:
 *
 *   - QUEUE durable: pesan disimpan ke disk, tidak hilang walau proses mati.
 *   - ACK: pesan baru dihapus dari queue setelah consumer mengkonfirmasi.
 *   - NACK + requeue: bila gagal diproses, pesan dikembalikan ke queue.
 *   - PREFETCH (backpressure): consumer hanya menarik N pesan sekaligus,
 *     sehingga server tidak overload meski producer mengirim sangat cepat.
 *
 * Pemetaan ke RabbitMQ:
 *   broker.publish(queue, msg)         ~ channel.sendToQueue(queue, buffer)
 *   broker.consume(queue, handler)     ~ channel.consume(queue, onMessage)
 *   prefetch                            ~ channel.prefetch(n)
 *   ack/nack                            ~ channel.ack() / channel.nack()
 *
 * Catatan: di produksi nyata, gunakan RabbitMQ/Kafka. Di sini konsepnya
 * direplikasi agar bisa dijalankan tanpa infrastruktur tambahan.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class MessageBroker extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.dataDir folder penyimpanan queue durable
   */
  constructor(opts = {}) {
    super();
    this.dataDir = opts.dataDir || path.join(__dirname, 'data');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.queues = new Map(); // name -> { messages: [], file, consumers: [] }
    this._seq = 0;
  }

  _queueFile(name) {
    return path.join(this.dataDir, `queue-${name}.json`);
  }

  /** Pastikan queue ada; muat dari disk bila file durable sudah ada. */
  assertQueue(name) {
    if (this.queues.has(name)) return this.queues.get(name);
    const file = this._queueFile(name);
    let messages = [];
    if (fs.existsSync(file)) {
      try {
        messages = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (_) {
        messages = [];
      }
    }
    const q = { name, messages, file, consumers: [], dispatching: false };
    this.queues.set(name, q);
    return q;
  }

  _persist(q) {
    // Tulis isi queue ke disk -> inilah yang membuat queue "durable".
    fs.writeFileSync(q.file, JSON.stringify(q.messages));
  }

  /** Publikasikan pesan ke queue (producer / sistem kurir). */
  publish(name, payload) {
    const q = this.assertQueue(name);
    const msg = {
      id: ++this._seq,
      payload,
      enqueued_at: new Date().toISOString(),
      delivered: false,    // sedang dikirim ke consumer & menunggu ack
      attempts: 0,
    };
    q.messages.push(msg);
    this._persist(q);
    this.emit('publish', { queue: name, message: msg });
    this._dispatch(q);
    return msg.id;
  }

  /**
   * Daftarkan consumer dengan backpressure (prefetch).
   * @param {string} name nama queue
   * @param {function} handler async (payload, meta) => void ; throw = gagal (nack)
   * @param {object} opts { prefetch, processingDelayMs }
   */
  consume(name, handler, opts = {}) {
    const q = this.assertQueue(name);
    const consumer = {
      handler,
      prefetch: opts.prefetch || 1,    // maksimum pesan diproses bersamaan
      inFlight: 0,
      processingDelayMs: opts.processingDelayMs || 0,
    };
    q.consumers.push(consumer);
    this._dispatch(q);
    return consumer;
  }

  depth(name) {
    const q = this.assertQueue(name);
    return q.messages.filter((m) => !m.delivered).length;
  }

  /** Inti dispatcher: hormati prefetch tiap consumer (cegah overload). */
  _dispatch(q) {
    for (const consumer of q.consumers) {
      while (consumer.inFlight < consumer.prefetch) {
        const msg = q.messages.find((m) => !m.delivered);
        if (!msg) break;
        msg.delivered = true;
        msg.attempts++;
        consumer.inFlight++;
        this._deliver(q, consumer, msg);
      }
    }
  }

  async _deliver(q, consumer, msg) {
    const meta = {
      id: msg.id,
      attempts: msg.attempts,
      ack: () => this._ack(q, consumer, msg),
      nack: (requeue = true) => this._nack(q, consumer, msg, requeue),
    };
    try {
      if (consumer.processingDelayMs) {
        await new Promise((r) => setTimeout(r, consumer.processingDelayMs));
      }
      await consumer.handler(msg.payload, meta);
      // Auto-ack bila handler tidak melempar error.
      this._ack(q, consumer, msg);
    } catch (err) {
      this.emit('handler-error', { queue: q.name, message: msg, error: err });
      this._nack(q, consumer, msg, true);
    }
  }

  _ack(q, consumer, msg) {
    const idx = q.messages.indexOf(msg);
    if (idx !== -1) q.messages.splice(idx, 1); // hapus permanen
    consumer.inFlight = Math.max(0, consumer.inFlight - 1);
    this._persist(q);
    this.emit('ack', { queue: q.name, message: msg });
    this._dispatch(q);
  }

  _nack(q, consumer, msg, requeue) {
    consumer.inFlight = Math.max(0, consumer.inFlight - 1);
    if (requeue) {
      msg.delivered = false; // kembalikan ke queue agar diproses ulang
    } else {
      const idx = q.messages.indexOf(msg);
      if (idx !== -1) q.messages.splice(idx, 1);
    }
    this._persist(q);
    this.emit('nack', { queue: q.name, message: msg, requeued: !!requeue });
    this._dispatch(q);
  }

  /** Tutup broker (lepas consumer); data tetap di disk (durable). */
  close() {
    for (const q of this.queues.values()) {
      q.consumers = [];
      this._persist(q);
    }
  }
}

module.exports = { MessageBroker };
