'use strict';

/**
 * Logger sederhana dengan timestamp dan label warna.
 * Dipakai bersama oleh semua modul agar output demo mudah dibaca.
 */

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function makeLogger(tag, color = 'cyan') {
  const paint = COLORS[color] || COLORS.cyan;
  const prefix = `${paint}[${tag}]${COLORS.reset}`;
  const log = (...args) =>
    console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${prefix}`, ...args);
  log.warn = (...args) =>
    console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${prefix} ${COLORS.yellow}WARN${COLORS.reset}`, ...args);
  log.error = (...args) =>
    console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${prefix} ${COLORS.red}ERROR${COLORS.reset}`, ...args);
  log.ok = (...args) =>
    console.log(`${COLORS.gray}${timestamp()}${COLORS.reset} ${prefix} ${COLORS.green}OK${COLORS.reset}`, ...args);
  return log;
}

module.exports = { makeLogger, COLORS };
