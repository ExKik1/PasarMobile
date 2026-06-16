'use strict';

/**
 * Menjalankan ketiga demo kasus secara berurutan dalam satu perintah.
 *   node scripts/run-all.js   (atau: npm run demo:all)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = { ...process.env, NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' };

const steps = [
  ['KASUS 1 - REST API (Synchronous)', 'src/kasus1-rest-api/demo.js'],
  ['KASUS 2 - File + Database (Batch)', 'src/kasus2-batch-report/generate-report.js'],
  ['KASUS 3 - Message Broker (Async)', 'src/kasus3-message-broker/demo.js'],
];

for (const [title, script] of steps) {
  console.log('\n' + '='.repeat(70));
  console.log('  ' + title);
  console.log('='.repeat(70));
  const res = spawnSync('node', [script], { cwd: ROOT, env, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`\nGagal menjalankan ${script}`);
    process.exit(res.status || 1);
  }
}

console.log('\nSemua demo selesai dijalankan.\n');
