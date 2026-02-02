#!/usr/bin/env node

/**
 * Run All Benchmarks
 *
 * This script runs all benchmarks with different UV_THREADPOOL_SIZE values
 * and saves results for comparison.
 *
 * Usage:
 *   node run-all-benchmarks.js [--sizes 4,8,16,auto] [--benchmarks fs,crypto]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { getAutoSize, formatDuration, printSystemInfo } from './lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BENCHMARKS = {
  fs: 'benchmarks/fs-operations.js',
  crypto: 'benchmarks/crypto-operations.js',
  dns: 'benchmarks/dns-operations.js',
  zlib: 'benchmarks/zlib-operations.js',
  mixed: 'benchmarks/mixed-workload.js',
  memory: 'benchmarks/memory-usage.js',
};

const DEFAULT_SIZES = [4, 'auto'];

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    sizes: DEFAULT_SIZES,
    benchmarks: Object.keys(BENCHMARKS),
    outputDir: path.join(__dirname, 'results'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sizes' && args[i + 1]) {
      result.sizes = args[i + 1].split(',').map(s => {
        const trimmed = s.trim();
        return trimmed === 'auto' ? 'auto' : parseInt(trimmed, 10);
      });
      i++;
    } else if (args[i] === '--benchmarks' && args[i + 1]) {
      result.benchmarks = args[i + 1].split(',').map(s => s.trim());
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log(`
UV Threadpool Benchmark Runner

Usage: node run-all-benchmarks.js [options]

Options:
  --sizes <sizes>       Comma-separated threadpool sizes (default: 4,auto)
                        Use 'auto' to test the new auto-sizing behavior
  --benchmarks <names>  Comma-separated benchmark names (default: all)
                        Available: ${Object.keys(BENCHMARKS).join(', ')}
  --output <dir>        Output directory for results (default: ./results)
  --help                Show this help message

Examples:
  node run-all-benchmarks.js
  node run-all-benchmarks.js --sizes 4,8,16,32,auto
  node run-all-benchmarks.js --benchmarks fs,crypto --sizes 4,auto
      `);
      process.exit(0);
    }
  }

  return result;
}

function runBenchmark(benchmarkPath, threadpoolSize) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };

    if (threadpoolSize === 'auto') {
      delete env.UV_THREADPOOL_SIZE;
    } else {
      env.UV_THREADPOOL_SIZE = String(threadpoolSize);
    }

    const child = spawn(process.execPath, [benchmarkPath], {
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: __dirname,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      const text = data.toString();
      process.stdout.write(text);
      stdout += text;
    });

    child.stderr.on('data', data => {
      const text = data.toString();
      process.stderr.write(text);
      stderr += text;
    });

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Benchmark exited with code ${code}`));
        return;
      }

      // Extract JSON output
      const jsonMatch = stdout.match(/📄 JSON Output:\n([\s\S]+)$/);
      if (jsonMatch) {
        try {
          const json = JSON.parse(jsonMatch[1].trim());
          resolve({ output: stdout, json });
        } catch (e) {
          resolve({ output: stdout, json: null });
        }
      } else {
        resolve({ output: stdout, json: null });
      }
    });

    child.on('error', reject);
  });
}

async function main() {
  const config = parseArgs();

  printSystemInfo();

  console.log('\n' + '='.repeat(70));
  console.log('UV_THREADPOOL_SIZE BENCHMARK SUITE');
  console.log('='.repeat(70));
  console.log(`\nTesting PR: https://github.com/nodejs/node/pull/61533`);
  console.log(`Auto threadpool size on this system: ${getAutoSize()}`);
  console.log(`\nThreadpool sizes to test: ${config.sizes.join(', ')}`);
  console.log(`Benchmarks to run: ${config.benchmarks.join(', ')}`);

  // Create results directory
  await fs.mkdir(config.outputDir, { recursive: true });

  const allResults = {
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      availableParallelism: os.availableParallelism(),
      totalMemory: os.totalmem(),
      nodeVersion: process.version,
      autoThreadpoolSize: getAutoSize(),
    },
    timestamp: new Date().toISOString(),
    benchmarks: {},
  };

  const startTime = Date.now();

  for (const benchName of config.benchmarks) {
    const benchPath = BENCHMARKS[benchName];
    if (!benchPath) {
      console.error(`\n⚠️  Unknown benchmark: ${benchName}`);
      continue;
    }

    console.log('\n' + '='.repeat(70));
    console.log(`BENCHMARK: ${benchName.toUpperCase()}`);
    console.log('='.repeat(70));

    allResults.benchmarks[benchName] = {};

    for (const size of config.sizes) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`Running with UV_THREADPOOL_SIZE=${size}`);
      console.log('─'.repeat(50) + '\n');

      try {
        const result = await runBenchmark(path.join(__dirname, benchPath), size);
        allResults.benchmarks[benchName][size] = result.json;

        // Save individual result
        const filename = `${benchName}-size-${size}.json`;
        await fs.writeFile(
          path.join(config.outputDir, filename),
          JSON.stringify(result.json, null, 2)
        );
      } catch (e) {
        console.error(`\n❌ Error running ${benchName} with size ${size}: ${e.message}`);
        allResults.benchmarks[benchName][size] = { error: e.message };
      }
    }
  }

  // Save combined results
  const combinedPath = path.join(config.outputDir, 'all-results.json');
  await fs.writeFile(combinedPath, JSON.stringify(allResults, null, 2));

  const elapsed = Date.now() - startTime;

  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK SUITE COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nTotal time: ${formatDuration(elapsed)}`);
  console.log(`Results saved to: ${config.outputDir}`);
  console.log(`\nTo compare results, run:`);
  console.log(`  node compare-results.js`);
}

main().catch(console.error);
