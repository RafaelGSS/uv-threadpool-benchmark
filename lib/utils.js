import os from 'node:os';
import { performance, PerformanceObserver } from 'node:perf_hooks';

export const THREADPOOL_SIZES = [4, 8, 16, 32, 64, 128];

export function getAutoSize() {
  return Math.min(Math.max(4, os.availableParallelism()), 1024);
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(2)} ${units[i]}`;
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
  };
}

export function calculateStats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    stdDev,
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    samples: sorted.length,
  };
}

export async function runBenchmark(name, fn, options = {}) {
  const { warmupIterations = 5, iterations = 20 } = options;

  console.log(`\n📊 Running: ${name}`);
  console.log(`   Warmup: ${warmupIterations} iterations`);
  console.log(`   Benchmark: ${iterations} iterations`);

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // Force GC if available
  if (global.gc) global.gc();

  const times = [];
  const memBefore = getMemoryUsage();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const memAfter = getMemoryUsage();
  const stats = calculateStats(times);

  return {
    name,
    stats,
    memory: {
      before: memBefore,
      after: memAfter,
      diff: {
        heapUsed: memAfter.heapUsed - memBefore.heapUsed,
        rss: memAfter.rss - memBefore.rss,
      },
    },
    threadpoolSize: process.env.UV_THREADPOOL_SIZE || 'auto',
  };
}

export function printResults(result) {
  console.log(`\n✅ Results for: ${result.name}`);
  console.log(`   Threadpool size: ${result.threadpoolSize}`);
  console.log(`   Mean: ${formatDuration(result.stats.mean)}`);
  console.log(`   Median: ${formatDuration(result.stats.median)}`);
  console.log(`   Std Dev: ${formatDuration(result.stats.stdDev)}`);
  console.log(`   Min: ${formatDuration(result.stats.min)}`);
  console.log(`   Max: ${formatDuration(result.stats.max)}`);
  console.log(`   P95: ${formatDuration(result.stats.p95)}`);
  console.log(`   P99: ${formatDuration(result.stats.p99)}`);
  console.log(`   Memory (heap diff): ${formatBytes(result.memory.diff.heapUsed)}`);
  console.log(`   Memory (RSS diff): ${formatBytes(result.memory.diff.rss)}`);
}

export function printComparison(baseline, current) {
  const improvement = ((baseline.stats.mean - current.stats.mean) / baseline.stats.mean) * 100;
  const sign = improvement > 0 ? '+' : '';

  console.log(`\n📈 Comparison: ${current.name}`);
  console.log(`   Baseline (${baseline.threadpoolSize}): ${formatDuration(baseline.stats.mean)}`);
  console.log(`   Current (${current.threadpoolSize}): ${formatDuration(current.stats.mean)}`);
  console.log(`   Difference: ${sign}${improvement.toFixed(2)}% ${improvement > 0 ? '(faster)' : '(slower)'}`);
}

export function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    availableParallelism: os.availableParallelism(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    nodeVersion: process.version,
    uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE || `auto (${getAutoSize()})`,
  };
}

export function printSystemInfo() {
  const info = getSystemInfo();
  console.log('\n🖥️  System Information:');
  console.log(`   Platform: ${info.platform} (${info.arch})`);
  console.log(`   CPUs: ${info.cpus}`);
  console.log(`   Available Parallelism: ${info.availableParallelism}`);
  console.log(`   Total Memory: ${formatBytes(info.totalMemory)}`);
  console.log(`   Node.js: ${info.nodeVersion}`);
  console.log(`   UV_THREADPOOL_SIZE: ${info.uvThreadpoolSize}`);
}
