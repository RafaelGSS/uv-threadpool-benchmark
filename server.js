#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const pbkdf2 = promisify(crypto.pbkdf2);

const PORT = process.env.PORT || 3000;
const TEMP_DIR = path.join(os.tmpdir(), 'uv-bench-server');
const TEST_FILE = path.join(TEMP_DIR, 'test-data.bin');

let requestCount = 0;
let errorCount = 0;
const startTime = Date.now();

async function setup() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.writeFile(TEST_FILE, crypto.randomBytes(100 * 1024)); // 100KB
}

async function handleCrypto(res) {
  try {
    // PBKDF2 - uses libuv threadpool
    await pbkdf2('benchmark-password', crypto.randomBytes(16), 10000, 64, 'sha512');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } catch (err) {
    errorCount++;
    res.writeHead(500);
    res.end('Error');
  }
}

async function handleFs(res) {
  try {
    // Async file read - uses libuv threadpool
    await fs.readFile(TEST_FILE);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } catch (err) {
    errorCount++;
    res.writeHead(500);
    res.end('Error');
  }
}

async function handleMixed(res) {
  try {
    await Promise.all([
      pbkdf2('benchmark', crypto.randomBytes(16), 5000, 32, 'sha256'),
      fs.readFile(TEST_FILE),
    ]);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } catch (err) {
    errorCount++;
    res.writeHead(500);
    res.end('Error');
  }
}

function handleMetrics(res) {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    uptime: Date.now() - startTime,
    requests: requestCount,
    errors: errorCount,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    cpu: {
      user: cpu.user,
      system: cpu.system,
    },
    threadpoolSize: process.env.UV_THREADPOOL_SIZE || 'auto',
  }, null, 2));
}

const server = http.createServer(async (req, res) => {
  requestCount++;

  switch (req.url) {
    case '/crypto':
      await handleCrypto(res);
      break;
    case '/fs':
      await handleFs(res);
      break;
    case '/mixed':
      await handleMixed(res);
      break;
    case '/metrics':
      handleMetrics(res);
      break;
    default:
      res.writeHead(404);
      res.end('Not found');
  }
});

async function main() {
  await setup();

  const autoSize = Math.min(Math.max(4, os.availableParallelism()), 1024);
  const size = process.env.UV_THREADPOOL_SIZE || `auto (${autoSize})`;

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`UV_THREADPOOL_SIZE: ${size}`);
    console.log(`\nEndpoints: /crypto, /fs, /mixed, /metrics`);
  });
}

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

main().catch(console.error);
