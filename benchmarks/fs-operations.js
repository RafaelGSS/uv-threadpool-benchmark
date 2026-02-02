/**
 * File System Operations Benchmark
 *
 * Tests the impact of UV_THREADPOOL_SIZE on async file system operations.
 * The libuv threadpool handles async fs operations, so more threads can
 * improve throughput when there are many concurrent I/O operations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  runBenchmark,
  printResults,
  printSystemInfo,
  formatDuration,
} from '../lib/utils.js';

const TEMP_DIR = path.join(os.tmpdir(), 'uv-threadpool-bench');
const FILE_SIZE = 1024 * 1024; // 1MB
const NUM_FILES = 100;
const CONCURRENCY_LEVELS = [10, 50, 100, 200];

async function setup() {
  await fs.mkdir(TEMP_DIR, { recursive: true });

  // Create test files
  const data = crypto.randomBytes(FILE_SIZE);
  const writePromises = [];

  for (let i = 0; i < NUM_FILES; i++) {
    writePromises.push(
      fs.writeFile(path.join(TEMP_DIR, `test-${i}.bin`), data)
    );
  }

  await Promise.all(writePromises);
  console.log(`✅ Created ${NUM_FILES} test files (${FILE_SIZE / 1024}KB each)`);
}

async function cleanup() {
  await fs.rm(TEMP_DIR, { recursive: true, force: true });
}

/**
 * Benchmark: Concurrent file reads
 * Tests how well the threadpool handles many parallel read operations.
 */
async function benchConcurrentReads(concurrency) {
  const files = Array.from({ length: concurrency }, (_, i) =>
    path.join(TEMP_DIR, `test-${i % NUM_FILES}.bin`)
  );

  return runBenchmark(
    `Concurrent reads (${concurrency} files)`,
    async () => {
      await Promise.all(files.map(f => fs.readFile(f)));
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Concurrent file writes
 * Tests how well the threadpool handles many parallel write operations.
 */
async function benchConcurrentWrites(concurrency) {
  const data = crypto.randomBytes(1024 * 100); // 100KB

  return runBenchmark(
    `Concurrent writes (${concurrency} files)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(
          fs.writeFile(path.join(TEMP_DIR, `write-${i}.bin`), data)
        );
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Concurrent stat operations
 * Tests metadata operations which are also threadpool-bound.
 */
async function benchConcurrentStats(concurrency) {
  const files = Array.from({ length: concurrency }, (_, i) =>
    path.join(TEMP_DIR, `test-${i % NUM_FILES}.bin`)
  );

  return runBenchmark(
    `Concurrent stat (${concurrency} files)`,
    async () => {
      await Promise.all(files.map(f => fs.stat(f)));
    },
    { iterations: 20 }
  );
}

/**
 * Benchmark: Mixed read/write/stat operations
 * Simulates realistic workload with mixed operations.
 */
async function benchMixedOperations(concurrency) {
  const data = crypto.randomBytes(1024 * 10);

  return runBenchmark(
    `Mixed operations (${concurrency} ops)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        const op = i % 3;
        const filePath = path.join(TEMP_DIR, `test-${i % NUM_FILES}.bin`);

        if (op === 0) {
          promises.push(fs.readFile(filePath));
        } else if (op === 1) {
          promises.push(fs.writeFile(path.join(TEMP_DIR, `mixed-${i}.bin`), data));
        } else {
          promises.push(fs.stat(filePath));
        }
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Sequential vs Parallel comparison
 * Shows where threadpool parallelism helps most.
 */
async function benchSequentialVsParallel() {
  const numOps = 50;
  const data = crypto.randomBytes(1024 * 50);

  const sequentialResult = await runBenchmark(
    `Sequential writes (${numOps} files)`,
    async () => {
      for (let i = 0; i < numOps; i++) {
        await fs.writeFile(path.join(TEMP_DIR, `seq-${i}.bin`), data);
      }
    },
    { iterations: 10 }
  );

  const parallelResult = await runBenchmark(
    `Parallel writes (${numOps} files)`,
    async () => {
      const promises = [];
      for (let i = 0; i < numOps; i++) {
        promises.push(fs.writeFile(path.join(TEMP_DIR, `par-${i}.bin`), data));
      }
      await Promise.all(promises);
    },
    { iterations: 10 }
  );

  return { sequentialResult, parallelResult };
}

async function main() {
  printSystemInfo();

  console.log('\n' + '='.repeat(60));
  console.log('FILE SYSTEM OPERATIONS BENCHMARK');
  console.log('='.repeat(60));

  try {
    await setup();

    const results = [];

    // Test different concurrency levels
    for (const concurrency of CONCURRENCY_LEVELS) {
      results.push(await benchConcurrentReads(concurrency));
      results.push(await benchConcurrentWrites(concurrency));
      results.push(await benchConcurrentStats(concurrency));
      results.push(await benchMixedOperations(concurrency));
    }

    // Sequential vs Parallel
    const seqVsPar = await benchSequentialVsParallel();
    results.push(seqVsPar.sequentialResult);
    results.push(seqVsPar.parallelResult);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    for (const result of results) {
      printResults(result);
    }

    // Output JSON for comparison
    const output = {
      benchmark: 'fs-operations',
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
