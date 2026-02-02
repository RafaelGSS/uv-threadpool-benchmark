/**
 * Crypto Operations Benchmark
 *
 * Tests the impact of UV_THREADPOOL_SIZE on async crypto operations.
 * Operations like pbkdf2, scrypt, and randomFill use the threadpool.
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import {
  runBenchmark,
  printResults,
  printSystemInfo,
} from '../lib/utils.js';

const pbkdf2 = promisify(crypto.pbkdf2);
const scrypt = promisify(crypto.scrypt);
const randomFill = promisify(crypto.randomFill);

const CONCURRENCY_LEVELS = [4, 8, 16, 32, 64];

/**
 * Benchmark: Concurrent PBKDF2 operations
 * PBKDF2 is CPU-intensive and commonly used for password hashing.
 */
async function benchPbkdf2(concurrency) {
  const password = 'test-password-123';
  const salt = crypto.randomBytes(16);
  const iterations = 10000;
  const keylen = 64;

  return runBenchmark(
    `PBKDF2 (${concurrency} concurrent, ${iterations} iterations)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(pbkdf2(password, salt, iterations, keylen, 'sha512'));
      }
      await Promise.all(promises);
    },
    { iterations: 10, warmupIterations: 3 }
  );
}

/**
 * Benchmark: Concurrent scrypt operations
 * scrypt is memory-hard and CPU-intensive, used for password hashing.
 */
async function benchScrypt(concurrency) {
  const password = 'test-password-123';
  const salt = crypto.randomBytes(16);
  const keylen = 64;

  return runBenchmark(
    `scrypt (${concurrency} concurrent)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(scrypt(password, salt, keylen));
      }
      await Promise.all(promises);
    },
    { iterations: 10, warmupIterations: 3 }
  );
}

/**
 * Benchmark: Concurrent randomFill operations
 * Tests random number generation through the threadpool.
 */
async function benchRandomFill(concurrency) {
  const bufferSize = 1024 * 64; // 64KB

  return runBenchmark(
    `randomFill (${concurrency} concurrent, ${bufferSize / 1024}KB)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        const buffer = Buffer.alloc(bufferSize);
        promises.push(randomFill(buffer));
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Mixed crypto workload
 * Simulates real-world scenario with different crypto operations.
 */
async function benchMixedCrypto(concurrency) {
  const password = 'test-password-123';
  const salt = crypto.randomBytes(16);

  return runBenchmark(
    `Mixed crypto (${concurrency} concurrent)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        const op = i % 3;
        if (op === 0) {
          promises.push(pbkdf2(password, salt, 5000, 32, 'sha256'));
        } else if (op === 1) {
          promises.push(scrypt(password, salt, 32));
        } else {
          const buffer = Buffer.alloc(1024 * 16);
          promises.push(randomFill(buffer));
        }
      }
      await Promise.all(promises);
    },
    { iterations: 10 }
  );
}

/**
 * Benchmark: High-contention PBKDF2
 * Tests behavior under high contention with expensive operations.
 */
async function benchHighContentionPbkdf2() {
  const password = 'test-password-123';
  const salt = crypto.randomBytes(16);
  const iterations = 50000; // Very expensive
  const keylen = 64;
  const concurrency = 32;

  return runBenchmark(
    `High-contention PBKDF2 (${concurrency}x, ${iterations} iterations)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(pbkdf2(password, salt, iterations, keylen, 'sha512'));
      }
      await Promise.all(promises);
    },
    { iterations: 5, warmupIterations: 2 }
  );
}

/**
 * Benchmark: Throughput test
 * Measures how many operations can be completed in parallel.
 */
async function benchThroughput() {
  const password = 'test';
  const salt = crypto.randomBytes(8);
  const totalOps = 100;

  return runBenchmark(
    `Throughput (${totalOps} PBKDF2 ops, 1000 iterations each)`,
    async () => {
      const promises = [];
      for (let i = 0; i < totalOps; i++) {
        promises.push(pbkdf2(password, salt, 1000, 32, 'sha256'));
      }
      await Promise.all(promises);
    },
    { iterations: 10 }
  );
}

async function main() {
  printSystemInfo();

  console.log('\n' + '='.repeat(60));
  console.log('CRYPTO OPERATIONS BENCHMARK');
  console.log('='.repeat(60));

  const results = [];

  // PBKDF2 tests
  for (const concurrency of CONCURRENCY_LEVELS) {
    results.push(await benchPbkdf2(concurrency));
  }

  // scrypt tests
  for (const concurrency of [4, 8, 16, 32]) {
    results.push(await benchScrypt(concurrency));
  }

  // randomFill tests
  for (const concurrency of CONCURRENCY_LEVELS) {
    results.push(await benchRandomFill(concurrency));
  }

  // Mixed workload
  for (const concurrency of [8, 16, 32]) {
    results.push(await benchMixedCrypto(concurrency));
  }

  // High contention
  results.push(await benchHighContentionPbkdf2());

  // Throughput
  results.push(await benchThroughput());

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    printResults(result);
  }

  // Output JSON
  const output = {
    benchmark: 'crypto-operations',
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
}

main().catch(console.error);
