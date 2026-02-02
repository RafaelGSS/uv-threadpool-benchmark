/**
 * Zlib Operations Benchmark
 *
 * Tests the impact of UV_THREADPOOL_SIZE on async zlib operations.
 * Compression/decompression operations use the threadpool.
 */

import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import {
  runBenchmark,
  printResults,
  printSystemInfo,
  formatBytes,
} from '../lib/utils.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);
const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

const CONCURRENCY_LEVELS = [4, 8, 16, 32, 64];

// Generate test data with varying compressibility
function generateTestData(size, compressibility = 'medium') {
  if (compressibility === 'high') {
    // Highly compressible: repeated patterns
    const pattern = 'The quick brown fox jumps over the lazy dog. ';
    return Buffer.from(pattern.repeat(Math.ceil(size / pattern.length)).slice(0, size));
  } else if (compressibility === 'low') {
    // Low compressibility: random data
    return crypto.randomBytes(size);
  } else {
    // Medium: mix of patterns and variation
    const chunks = [];
    for (let i = 0; i < size; i += 1024) {
      if (i % 2048 === 0) {
        chunks.push(Buffer.from('HEADER_'.repeat(146))); // ~1KB pattern
      } else {
        chunks.push(crypto.randomBytes(1024));
      }
    }
    return Buffer.concat(chunks).slice(0, size);
  }
}

const DATA_SIZES = {
  small: 10 * 1024,        // 10KB
  medium: 100 * 1024,      // 100KB
  large: 1024 * 1024,      // 1MB
};

/**
 * Benchmark: Concurrent gzip compression
 */
async function benchGzipCompress(concurrency, dataSize, compressibility) {
  const data = generateTestData(dataSize, compressibility);
  const sizeLabel = formatBytes(dataSize);

  return runBenchmark(
    `gzip compress (${concurrency}x, ${sizeLabel}, ${compressibility})`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(gzip(data));
      }
      await Promise.all(promises);
    },
    { iterations: 12 }
  );
}

/**
 * Benchmark: Concurrent gzip decompression
 */
async function benchGzipDecompress(concurrency, dataSize) {
  const data = generateTestData(dataSize, 'medium');
  const compressed = await gzip(data);
  const sizeLabel = formatBytes(dataSize);

  return runBenchmark(
    `gzip decompress (${concurrency}x, ${sizeLabel})`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(gunzip(compressed));
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Concurrent deflate operations
 */
async function benchDeflate(concurrency, dataSize) {
  const data = generateTestData(dataSize, 'medium');
  const sizeLabel = formatBytes(dataSize);

  return runBenchmark(
    `deflate (${concurrency}x, ${sizeLabel})`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(deflate(data));
      }
      await Promise.all(promises);
    },
    { iterations: 12 }
  );
}

/**
 * Benchmark: Concurrent brotli compression
 * Brotli is more CPU-intensive than gzip.
 */
async function benchBrotliCompress(concurrency, dataSize) {
  const data = generateTestData(dataSize, 'medium');
  const sizeLabel = formatBytes(dataSize);

  return runBenchmark(
    `brotli compress (${concurrency}x, ${sizeLabel})`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(brotliCompress(data, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 4, // Fast mode
          },
        }));
      }
      await Promise.all(promises);
    },
    { iterations: 10 }
  );
}

/**
 * Benchmark: Concurrent brotli decompression
 */
async function benchBrotliDecompress(concurrency, dataSize) {
  const data = generateTestData(dataSize, 'medium');
  const compressed = await brotliCompress(data, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
  });
  const sizeLabel = formatBytes(dataSize);

  return runBenchmark(
    `brotli decompress (${concurrency}x, ${sizeLabel})`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(brotliDecompress(compressed));
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Mixed compression workload
 * Simulates HTTP server compressing responses.
 */
async function benchMixedCompression(concurrency) {
  const smallData = generateTestData(DATA_SIZES.small, 'high');
  const mediumData = generateTestData(DATA_SIZES.medium, 'medium');

  return runBenchmark(
    `Mixed compression (${concurrency} ops)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        const op = i % 4;
        if (op === 0) {
          promises.push(gzip(smallData));
        } else if (op === 1) {
          promises.push(deflate(smallData));
        } else if (op === 2) {
          promises.push(gzip(mediumData));
        } else {
          promises.push(brotliCompress(smallData, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
          }));
        }
      }
      await Promise.all(promises);
    },
    { iterations: 10 }
  );
}

/**
 * Benchmark: High-throughput compression
 * Tests maximum throughput with many small operations.
 */
async function benchHighThroughput() {
  const data = generateTestData(5 * 1024, 'high'); // 5KB
  const numOps = 200;

  return runBenchmark(
    `High throughput (${numOps} gzip ops, 5KB each)`,
    async () => {
      const promises = [];
      for (let i = 0; i < numOps; i++) {
        promises.push(gzip(data));
      }
      await Promise.all(promises);
    },
    { iterations: 8 }
  );
}

/**
 * Benchmark: Compress/decompress round-trip
 */
async function benchRoundTrip(concurrency) {
  const data = generateTestData(DATA_SIZES.medium, 'medium');

  return runBenchmark(
    `Round-trip gzip (${concurrency}x, 100KB)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(
          gzip(data).then(compressed => gunzip(compressed))
        );
      }
      await Promise.all(promises);
    },
    { iterations: 10 }
  );
}

async function main() {
  printSystemInfo();

  console.log('\n' + '='.repeat(60));
  console.log('ZLIB OPERATIONS BENCHMARK');
  console.log('='.repeat(60));

  const results = [];

  // Gzip compression with different sizes and compressibility
  for (const concurrency of [4, 16, 32]) {
    results.push(await benchGzipCompress(concurrency, DATA_SIZES.medium, 'high'));
    results.push(await benchGzipCompress(concurrency, DATA_SIZES.medium, 'low'));
  }

  // Gzip with different data sizes
  for (const [sizeName, size] of Object.entries(DATA_SIZES)) {
    results.push(await benchGzipCompress(16, size, 'medium'));
  }

  // Gzip decompression
  for (const concurrency of CONCURRENCY_LEVELS.slice(0, 4)) {
    results.push(await benchGzipDecompress(concurrency, DATA_SIZES.medium));
  }

  // Deflate
  for (const concurrency of [8, 32]) {
    results.push(await benchDeflate(concurrency, DATA_SIZES.medium));
  }

  // Brotli (more CPU-intensive)
  for (const concurrency of [4, 8, 16]) {
    results.push(await benchBrotliCompress(concurrency, DATA_SIZES.small));
    results.push(await benchBrotliDecompress(concurrency, DATA_SIZES.small));
  }

  // Mixed workload
  for (const concurrency of [16, 32, 64]) {
    results.push(await benchMixedCompression(concurrency));
  }

  // High throughput
  results.push(await benchHighThroughput());

  // Round-trip
  for (const concurrency of [8, 16, 32]) {
    results.push(await benchRoundTrip(concurrency));
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    printResults(result);
  }

  // Output JSON
  const output = {
    benchmark: 'zlib-operations',
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
