/**
 * Mixed Workload Benchmark
 *
 * Tests the impact of UV_THREADPOOL_SIZE with realistic mixed workloads
 * that combine fs, crypto, dns, and zlib operations.
 *
 * This is the most realistic test as real applications typically
 * have a mix of different threadpool operations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import dns from 'node:dns';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import {
  runBenchmark,
  printResults,
  printSystemInfo,
} from '../lib/utils.js';

const pbkdf2 = promisify(crypto.pbkdf2);
const scrypt = promisify(crypto.scrypt);
const lookup = promisify(dns.lookup);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const TEMP_DIR = path.join(os.tmpdir(), 'uv-mixed-bench');

async function setup() {
  await fs.mkdir(TEMP_DIR, { recursive: true });

  // Create some test files
  const data = crypto.randomBytes(100 * 1024); // 100KB
  for (let i = 0; i < 20; i++) {
    await fs.writeFile(path.join(TEMP_DIR, `data-${i}.bin`), data);
  }
  console.log('✅ Test environment ready');
}

async function cleanup() {
  await fs.rm(TEMP_DIR, { recursive: true, force: true });
}

/**
 * Scenario: Web Server Simulation
 * Simulates a web server handling requests that need:
 * - DNS lookups (for upstream connections)
 * - File reads (static assets, templates)
 * - Compression (response compression)
 */
async function benchWebServer(requestCount) {
  const fileData = await fs.readFile(path.join(TEMP_DIR, 'data-0.bin'));

  return runBenchmark(
    `Web server simulation (${requestCount} requests)`,
    async () => {
      const requests = [];
      for (let i = 0; i < requestCount; i++) {
        // Each "request" does:
        // 1. DNS lookup
        // 2. File read
        // 3. Response compression
        requests.push(
          (async () => {
            await lookup('localhost').catch(() => null);
            const data = await fs.readFile(
              path.join(TEMP_DIR, `data-${i % 20}.bin`)
            );
            await gzip(data.slice(0, 10000)); // Compress first 10KB
          })()
        );
      }
      await Promise.all(requests);
    },
    { iterations: 10 }
  );
}

/**
 * Scenario: Authentication Service
 * Simulates auth service doing password hashing and file operations.
 */
async function benchAuthService(requestCount) {
  const password = 'user-password-123';
  const salt = crypto.randomBytes(16);

  return runBenchmark(
    `Auth service simulation (${requestCount} requests)`,
    async () => {
      const requests = [];
      for (let i = 0; i < requestCount; i++) {
        requests.push(
          (async () => {
            // Hash password
            await pbkdf2(password, salt, 10000, 64, 'sha512');
            // Read user data
            await fs.readFile(path.join(TEMP_DIR, `data-${i % 20}.bin`));
          })()
        );
      }
      await Promise.all(requests);
    },
    { iterations: 8 }
  );
}

/**
 * Scenario: File Processing Service
 * Simulates a service that reads, compresses, and writes files.
 */
async function benchFileProcessor(fileCount) {
  const compressedDir = path.join(TEMP_DIR, 'compressed');
  await fs.mkdir(compressedDir, { recursive: true });

  return runBenchmark(
    `File processor (${fileCount} files)`,
    async () => {
      const operations = [];
      for (let i = 0; i < fileCount; i++) {
        operations.push(
          (async () => {
            const data = await fs.readFile(
              path.join(TEMP_DIR, `data-${i % 20}.bin`)
            );
            const compressed = await gzip(data);
            await fs.writeFile(
              path.join(compressedDir, `compressed-${i}.gz`),
              compressed
            );
          })()
        );
      }
      await Promise.all(operations);
    },
    { iterations: 8 }
  );
}

/**
 * Scenario: API Gateway
 * Simulates gateway that validates tokens and proxies requests.
 */
async function benchApiGateway(requestCount) {
  const token = 'api-token-12345';
  const salt = crypto.randomBytes(8);

  return runBenchmark(
    `API gateway simulation (${requestCount} requests)`,
    async () => {
      const requests = [];
      for (let i = 0; i < requestCount; i++) {
        requests.push(
          (async () => {
            // Verify token (simplified)
            await pbkdf2(token, salt, 1000, 32, 'sha256');
            // DNS lookup for upstream
            await lookup('localhost').catch(() => null);
            // Read cached response
            await fs.readFile(path.join(TEMP_DIR, `data-${i % 20}.bin`));
          })()
        );
      }
      await Promise.all(requests);
    },
    { iterations: 10 }
  );
}

/**
 * Scenario: Heavy Crypto Workload
 * Tests behavior when crypto operations dominate.
 */
async function benchHeavyCrypto(operationCount) {
  const password = 'secure-password';
  const salt = crypto.randomBytes(16);
  const data = crypto.randomBytes(10000);

  return runBenchmark(
    `Heavy crypto workload (${operationCount} ops)`,
    async () => {
      const operations = [];
      for (let i = 0; i < operationCount; i++) {
        const op = i % 4;
        if (op === 0) {
          operations.push(pbkdf2(password, salt, 10000, 64, 'sha512'));
        } else if (op === 1) {
          operations.push(scrypt(password, salt, 64));
        } else if (op === 2) {
          operations.push(gzip(data));
        } else {
          const buf = Buffer.alloc(32 * 1024);
          operations.push(promisify(crypto.randomFill)(buf));
        }
      }
      await Promise.all(operations);
    },
    { iterations: 8 }
  );
}

/**
 * Scenario: Heavy I/O Workload
 * Tests behavior when I/O operations dominate.
 */
async function benchHeavyIO(operationCount) {
  const writeData = crypto.randomBytes(50 * 1024);

  return runBenchmark(
    `Heavy I/O workload (${operationCount} ops)`,
    async () => {
      const operations = [];
      for (let i = 0; i < operationCount; i++) {
        const op = i % 3;
        if (op === 0) {
          operations.push(
            fs.readFile(path.join(TEMP_DIR, `data-${i % 20}.bin`))
          );
        } else if (op === 1) {
          operations.push(
            fs.writeFile(path.join(TEMP_DIR, `io-${i}.bin`), writeData)
          );
        } else {
          operations.push(fs.stat(path.join(TEMP_DIR, `data-${i % 20}.bin`)));
        }
      }
      await Promise.all(operations);
    },
    { iterations: 10 }
  );
}

/**
 * Scenario: Balanced Workload
 * Equal mix of all threadpool operations.
 */
async function benchBalanced(operationCount) {
  const password = 'test';
  const salt = crypto.randomBytes(8);
  const compressData = crypto.randomBytes(5000);

  return runBenchmark(
    `Balanced workload (${operationCount} ops)`,
    async () => {
      const operations = [];
      for (let i = 0; i < operationCount; i++) {
        const op = i % 5;
        if (op === 0) {
          operations.push(
            fs.readFile(path.join(TEMP_DIR, `data-${i % 20}.bin`))
          );
        } else if (op === 1) {
          operations.push(pbkdf2(password, salt, 1000, 32, 'sha256'));
        } else if (op === 2) {
          operations.push(lookup('localhost').catch(() => null));
        } else if (op === 3) {
          operations.push(gzip(compressData));
        } else {
          operations.push(fs.stat(path.join(TEMP_DIR, `data-${i % 20}.bin`)));
        }
      }
      await Promise.all(operations);
    },
    { iterations: 10 }
  );
}

/**
 * Scenario: Staggered Load
 * Simulates realistic load patterns with staggered arrivals.
 */
async function benchStaggeredLoad(operationCount) {
  const data = crypto.randomBytes(5000);

  return runBenchmark(
    `Staggered load (${operationCount} ops)`,
    async () => {
      const operations = [];

      // Wave 1: Immediate burst
      for (let i = 0; i < operationCount / 3; i++) {
        operations.push(gzip(data));
      }

      // Wave 2: Staggered
      for (let i = 0; i < operationCount / 3; i++) {
        operations.push(
          new Promise(r => setTimeout(r, Math.random() * 10))
            .then(() => fs.readFile(path.join(TEMP_DIR, `data-${i % 20}.bin`)))
        );
      }

      // Wave 3: Late burst
      for (let i = 0; i < operationCount / 3; i++) {
        operations.push(
          new Promise(r => setTimeout(r, 20))
            .then(() => lookup('localhost').catch(() => null))
        );
      }

      await Promise.all(operations);
    },
    { iterations: 10 }
  );
}

async function main() {
  printSystemInfo();

  console.log('\n' + '='.repeat(60));
  console.log('MIXED WORKLOAD BENCHMARK');
  console.log('='.repeat(60));
  console.log('\nThis benchmark simulates realistic application scenarios');
  console.log('with mixed threadpool operations.\n');

  try {
    await setup();

    const results = [];

    // Web server simulation
    for (const count of [10, 30, 50, 100]) {
      results.push(await benchWebServer(count));
    }

    // Auth service
    for (const count of [5, 10, 20]) {
      results.push(await benchAuthService(count));
    }

    // File processor
    for (const count of [10, 30, 50]) {
      results.push(await benchFileProcessor(count));
    }

    // API gateway
    for (const count of [20, 50, 100]) {
      results.push(await benchApiGateway(count));
    }

    // Workload type comparisons
    for (const count of [32, 64]) {
      results.push(await benchHeavyCrypto(count));
      results.push(await benchHeavyIO(count));
      results.push(await benchBalanced(count));
    }

    // Staggered load
    results.push(await benchStaggeredLoad(60));
    results.push(await benchStaggeredLoad(120));

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    for (const result of results) {
      printResults(result);
    }

    // Output JSON
    const output = {
      benchmark: 'mixed-workload',
      threadpoolSize: process.env.UV_THREADPOOL_SIZE || 'auto',
      timestamp: new Date().toISOString(),
      results: results.map(r => ({
        name: r.name,
        mean: r.stats.mean,
        median: r.stats.median,
        stdDev: r.stats.stdDev,
        p95: r.stats.p95,
      })),
    };

    console.log('\n📄 JSON Output:');
    console.log(JSON.stringify(output, null, 2));

  } finally {
    await cleanup();
  }
}

main().catch(console.error);
