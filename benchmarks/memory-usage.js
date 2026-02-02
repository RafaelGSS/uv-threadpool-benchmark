/**
 * Memory Usage Benchmark
 *
 * Tests the memory impact of different UV_THREADPOOL_SIZE values.
 * More threads = more memory overhead from thread stacks.
 *
 * This helps identify potential drawbacks of larger threadpool sizes.
 */

import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  printSystemInfo,
  formatBytes,
  getAutoSize,
} from '../lib/utils.js';

const THREADPOOL_SIZES = [4, 8, 16, 32, 64, 128, 256, 512];

/**
 * Measure memory usage of a fresh Node.js process with given threadpool size.
 */
function measureMemory(threadpoolSize) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (threadpoolSize === 'auto') {
      delete env.UV_THREADPOOL_SIZE;
    } else {
      env.UV_THREADPOOL_SIZE = String(threadpoolSize);
    }

    const script = `
      // Wait for threadpool to initialize
      const crypto = require('crypto');
      const { promisify } = require('util');
      const pbkdf2 = promisify(crypto.pbkdf2);

      // Trigger threadpool initialization
      async function init() {
        const promises = [];
        for (let i = 0; i < ${threadpoolSize === 'auto' ? getAutoSize() : threadpoolSize}; i++) {
          promises.push(pbkdf2('test', 'salt', 1, 16, 'sha256'));
        }
        await Promise.all(promises);

        // Force GC if available
        if (global.gc) global.gc();

        // Small delay to let things settle
        await new Promise(r => setTimeout(r, 100));

        const mem = process.memoryUsage();
        console.log(JSON.stringify({
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: mem.external,
          arrayBuffers: mem.arrayBuffers,
        }));
      }

      init().catch(console.error);
    `;

    const child = spawn(process.execPath, ['--expose-gc', '-e', script], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const mem = JSON.parse(stdout.trim());
        resolve(mem);
      } catch (e) {
        reject(new Error(`Failed to parse output: ${stdout}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Measure memory under load.
 */
function measureMemoryUnderLoad(threadpoolSize, concurrentOps) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (threadpoolSize === 'auto') {
      delete env.UV_THREADPOOL_SIZE;
    } else {
      env.UV_THREADPOOL_SIZE = String(threadpoolSize);
    }

    const script = `
      const crypto = require('crypto');
      const zlib = require('zlib');
      const { promisify } = require('util');
      const pbkdf2 = promisify(crypto.pbkdf2);
      const gzip = promisify(zlib.gzip);

      async function run() {
        const data = crypto.randomBytes(10000);
        const measurements = [];

        // Run several iterations
        for (let iter = 0; iter < 5; iter++) {
          const promises = [];
          for (let i = 0; i < ${concurrentOps}; i++) {
            if (i % 2 === 0) {
              promises.push(pbkdf2('test', 'salt', 5000, 32, 'sha256'));
            } else {
              promises.push(gzip(data));
            }
          }

          // Measure during load
          const memDuring = process.memoryUsage();
          await Promise.all(promises);

          if (global.gc) global.gc();
          await new Promise(r => setTimeout(r, 50));

          const memAfter = process.memoryUsage();
          measurements.push({
            during: memDuring.rss,
            after: memAfter.rss,
          });
        }

        // Return average
        const avgDuring = measurements.reduce((a, m) => a + m.during, 0) / measurements.length;
        const avgAfter = measurements.reduce((a, m) => a + m.after, 0) / measurements.length;

        console.log(JSON.stringify({
          rssDuring: avgDuring,
          rssAfter: avgAfter,
          peakEstimate: Math.max(...measurements.map(m => m.during)),
        }));
      }

      run().catch(console.error);
    `;

    const child = spawn(process.execPath, ['--expose-gc', '-e', script], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const mem = JSON.parse(stdout.trim());
        resolve(mem);
      } catch (e) {
        reject(new Error(`Failed to parse output: ${stdout}`));
      }
    });

    child.on('error', reject);
  });
}

async function main() {
  printSystemInfo();

  console.log('\n' + '='.repeat(60));
  console.log('MEMORY USAGE BENCHMARK');
  console.log('='.repeat(60));
  console.log('\nMeasuring memory overhead of different threadpool sizes.\n');

  // Baseline memory measurements
  console.log('📊 Baseline Memory (idle after threadpool init):');
  console.log('-'.repeat(50));

  const baselineResults = [];
  const autoSize = getAutoSize();

  // Add auto to the test
  const sizesToTest = ['auto', ...THREADPOOL_SIZES.filter(s => s <= autoSize * 2)];

  for (const size of sizesToTest) {
    try {
      process.stdout.write(`   Testing UV_THREADPOOL_SIZE=${size}... `);
      const mem = await measureMemory(size);
      console.log(`RSS: ${formatBytes(mem.rss)}, Heap: ${formatBytes(mem.heapTotal)}`);
      baselineResults.push({
        threadpoolSize: size,
        ...mem,
      });
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  // Memory under load
  console.log('\n📊 Memory Under Load (64 concurrent operations):');
  console.log('-'.repeat(50));

  const loadResults = [];
  const concurrentOps = 64;

  for (const size of sizesToTest.slice(0, 6)) { // Test fewer sizes for load
    try {
      process.stdout.write(`   Testing UV_THREADPOOL_SIZE=${size}... `);
      const mem = await measureMemoryUnderLoad(size, concurrentOps);
      console.log(
        `Peak: ${formatBytes(mem.peakEstimate)}, After: ${formatBytes(mem.rssAfter)}`
      );
      loadResults.push({
        threadpoolSize: size,
        concurrentOps,
        ...mem,
      });
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  console.log('\n📈 Memory overhead per threadpool size (baseline):');
  if (baselineResults.length > 1) {
    const baseline = baselineResults[0]; // 'auto' or smallest
    for (const result of baselineResults) {
      const diff = result.rss - baseline.rss;
      const percent = ((diff / baseline.rss) * 100).toFixed(1);
      const sign = diff >= 0 ? '+' : '';
      console.log(
        `   ${String(result.threadpoolSize).padStart(4)}: ${formatBytes(result.rss).padStart(12)} (${sign}${percent}% vs ${baseline.threadpoolSize})`
      );
    }
  }

  console.log('\n📈 Memory overhead per threadpool size (under load):');
  if (loadResults.length > 1) {
    const baseline = loadResults[0];
    for (const result of loadResults) {
      const diff = result.peakEstimate - baseline.peakEstimate;
      const percent = ((diff / baseline.peakEstimate) * 100).toFixed(1);
      const sign = diff >= 0 ? '+' : '';
      console.log(
        `   ${String(result.threadpoolSize).padStart(4)}: ${formatBytes(result.peakEstimate).padStart(12)} peak (${sign}${percent}% vs ${baseline.threadpoolSize})`
      );
    }
  }

  // Recommendations
  console.log('\n💡 Analysis:');
  console.log(`   Your system has ${os.availableParallelism()} available parallelism`);
  console.log(`   Auto threadpool size would be: ${autoSize}`);

  if (autoSize > 4) {
    console.log(`\n   The new auto-sizing behavior will increase threadpool from 4 to ${autoSize}.`);
    const increase = baselineResults.find(r => r.threadpoolSize === autoSize);
    const baseline4 = baselineResults.find(r => r.threadpoolSize === 4);
    if (increase && baseline4) {
      const memIncrease = increase.rss - baseline4.rss;
      console.log(`   Expected memory increase: ~${formatBytes(memIncrease)}`);
    }
  }

  // Output JSON
  const output = {
    benchmark: 'memory-usage',
    autoThreadpoolSize: autoSize,
    timestamp: new Date().toISOString(),
    baseline: baselineResults,
    underLoad: loadResults,
  };

  console.log('\n📄 JSON Output:');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(console.error);
