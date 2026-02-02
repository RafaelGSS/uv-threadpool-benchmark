/**
 * DNS Operations Benchmark
 *
 * Tests the impact of UV_THREADPOOL_SIZE on dns.lookup() operations.
 * dns.lookup() uses the threadpool (unlike dns.resolve() which uses c-ares).
 *
 * This is particularly relevant for HTTP clients that use dns.lookup()
 * before establishing connections.
 */

import dns from 'node:dns';
import { promisify } from 'node:util';
import {
  runBenchmark,
  printResults,
  printSystemInfo,
} from '../lib/utils.js';

const lookup = promisify(dns.lookup);

// Common domains to lookup (will be cached by OS, but still shows threadpool behavior)
const DOMAINS = [
  'localhost',
  'google.com',
  'github.com',
  'nodejs.org',
  'npmjs.com',
  'cloudflare.com',
  'amazon.com',
  'microsoft.com',
];

const CONCURRENCY_LEVELS = [4, 8, 16, 32, 64, 128];

/**
 * Benchmark: Concurrent DNS lookups
 * Tests how well the threadpool handles many parallel DNS lookups.
 */
async function benchConcurrentLookups(concurrency) {
  return runBenchmark(
    `DNS lookup (${concurrency} concurrent)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        const domain = DOMAINS[i % DOMAINS.length];
        promises.push(lookup(domain).catch(() => null)); // Ignore errors
      }
      await Promise.all(promises);
    },
    { iterations: 20, warmupIterations: 5 }
  );
}

/**
 * Benchmark: Burst DNS lookups
 * Simulates burst traffic pattern common in microservices.
 */
async function benchBurstLookups() {
  const burstSize = 50;

  return runBenchmark(
    `DNS burst (${burstSize} lookups)`,
    async () => {
      const promises = [];
      for (let i = 0; i < burstSize; i++) {
        const domain = DOMAINS[i % DOMAINS.length];
        promises.push(lookup(domain).catch(() => null));
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Mixed IPv4/IPv6 lookups
 * Tests lookups with different address family hints.
 */
async function benchMixedFamilyLookups(concurrency) {
  return runBenchmark(
    `DNS mixed family (${concurrency} concurrent)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        const domain = DOMAINS[i % DOMAINS.length];
        const family = i % 2 === 0 ? 4 : 6;
        promises.push(
          lookup(domain, { family }).catch(() => null)
        );
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

/**
 * Benchmark: Localhost-only lookups (fastest, shows pure threadpool overhead)
 * This minimizes network latency to isolate threadpool behavior.
 */
async function benchLocalhostLookups(concurrency) {
  return runBenchmark(
    `Localhost lookup (${concurrency} concurrent)`,
    async () => {
      const promises = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(lookup('localhost'));
      }
      await Promise.all(promises);
    },
    { iterations: 30 }
  );
}

/**
 * Benchmark: Sequential vs Parallel lookups
 * Shows the benefit of parallel execution with larger threadpool.
 */
async function benchSequentialVsParallel() {
  const numLookups = 20;

  const sequentialResult = await runBenchmark(
    `Sequential lookups (${numLookups})`,
    async () => {
      for (let i = 0; i < numLookups; i++) {
        const domain = DOMAINS[i % DOMAINS.length];
        await lookup(domain).catch(() => null);
      }
    },
    { iterations: 10 }
  );

  const parallelResult = await runBenchmark(
    `Parallel lookups (${numLookups})`,
    async () => {
      const promises = [];
      for (let i = 0; i < numLookups; i++) {
        const domain = DOMAINS[i % DOMAINS.length];
        promises.push(lookup(domain).catch(() => null));
      }
      await Promise.all(promises);
    },
    { iterations: 10 }
  );

  return { sequentialResult, parallelResult };
}

/**
 * Benchmark: Simulated HTTP client connection pattern
 * Simulates how an HTTP client might make DNS lookups before connections.
 */
async function benchHttpClientPattern() {
  const numRequests = 30;

  return runBenchmark(
    `HTTP client pattern (${numRequests} lookups)`,
    async () => {
      // Simulate staggered request starts
      const promises = [];
      for (let i = 0; i < numRequests; i++) {
        const domain = DOMAINS[i % DOMAINS.length];
        // Add small random delay to simulate real request timing
        const delay = Math.random() * 5;
        promises.push(
          new Promise(resolve => setTimeout(resolve, delay))
            .then(() => lookup(domain))
            .catch(() => null)
        );
      }
      await Promise.all(promises);
    },
    { iterations: 15 }
  );
}

async function main() {
  printSystemInfo();

  console.log('\n' + '='.repeat(60));
  console.log('DNS OPERATIONS BENCHMARK');
  console.log('='.repeat(60));
  console.log('\n⚠️  Note: DNS results vary based on network conditions and caching.');
  console.log('   Localhost tests show threadpool overhead more accurately.\n');

  const results = [];

  // Localhost lookups (pure threadpool overhead)
  for (const concurrency of [4, 16, 64, 128, 256]) {
    results.push(await benchLocalhostLookups(concurrency));
  }

  // Concurrent lookups
  for (const concurrency of CONCURRENCY_LEVELS) {
    results.push(await benchConcurrentLookups(concurrency));
  }

  // Mixed family lookups
  for (const concurrency of [8, 32, 64]) {
    results.push(await benchMixedFamilyLookups(concurrency));
  }

  // Burst lookups
  results.push(await benchBurstLookups());

  // Sequential vs Parallel
  const seqVsPar = await benchSequentialVsParallel();
  results.push(seqVsPar.sequentialResult);
  results.push(seqVsPar.parallelResult);

  // HTTP client pattern
  results.push(await benchHttpClientPattern());

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    printResults(result);
  }

  // Output JSON
  const output = {
    benchmark: 'dns-operations',
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
