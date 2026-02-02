#!/usr/bin/env node

/**
 * Compare Benchmark Results
 *
 * Analyzes and compares results from different UV_THREADPOOL_SIZE configurations.
 *
 * Usage:
 *   node compare-results.js [--baseline 4] [--results ./results]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDuration, formatBytes, getAutoSize } from './lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    baseline: '4',
    resultsDir: path.join(__dirname, 'results'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseline' && args[i + 1]) {
      result.baseline = args[i + 1];
      i++;
    } else if (args[i] === '--results' && args[i + 1]) {
      result.resultsDir = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log(`
Compare Benchmark Results

Usage: node compare-results.js [options]

Options:
  --baseline <size>  Baseline threadpool size to compare against (default: 4)
  --results <dir>    Results directory (default: ./results)
  --help             Show this help message
      `);
      process.exit(0);
    }
  }

  return result;
}

function calculateImprovement(baseline, current) {
  if (!baseline || !current) return null;
  return ((baseline - current) / baseline) * 100;
}

function formatImprovement(improvement) {
  if (improvement === null) return 'N/A';
  const sign = improvement > 0 ? '+' : '';
  const color = improvement > 0 ? '\x1b[32m' : improvement < 0 ? '\x1b[31m' : '\x1b[33m';
  const reset = '\x1b[0m';
  return `${color}${sign}${improvement.toFixed(1)}%${reset}`;
}

function printComparisonTable(benchmarkName, baselineSize, results) {
  const sizes = Object.keys(results).filter(s => results[s] && !results[s].error);
  const baselineData = results[baselineSize];

  if (!baselineData || !baselineData.results) {
    console.log(`  No baseline data for size ${baselineSize}`);
    return;
  }

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`${benchmarkName.toUpperCase()} - Comparison vs baseline (UV_THREADPOOL_SIZE=${baselineSize})`);
  console.log('─'.repeat(80));

  // Get all test names from baseline
  const testNames = baselineData.results.map(r => r.name);

  // Print header
  const header = ['Test Name', ...sizes.filter(s => s !== baselineSize).map(s => `Size ${s}`)];
  console.log('\n' + header.map((h, i) => i === 0 ? h.padEnd(50) : h.padStart(12)).join(' '));
  console.log('-'.repeat(80));

  // Print each test comparison
  for (const testName of testNames) {
    const baselineTest = baselineData.results.find(r => r.name === testName);
    if (!baselineTest) continue;

    const row = [testName.slice(0, 48).padEnd(50)];

    for (const size of sizes) {
      if (size === baselineSize) continue;

      const sizeData = results[size];
      if (!sizeData || !sizeData.results) {
        row.push('N/A'.padStart(12));
        continue;
      }

      const sizeTest = sizeData.results.find(r => r.name === testName);
      if (!sizeTest) {
        row.push('N/A'.padStart(12));
        continue;
      }

      const improvement = calculateImprovement(baselineTest.mean, sizeTest.mean);
      row.push(formatImprovement(improvement).padStart(20)); // Extra space for ANSI codes
    }

    console.log(row.join(' '));
  }
}

function printSummaryTable(allResults, baselineSize) {
  console.log('\n' + '='.repeat(80));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(80));

  const summaries = {};

  for (const [benchName, sizeResults] of Object.entries(allResults.benchmarks)) {
    const baselineData = sizeResults[baselineSize];
    if (!baselineData || !baselineData.results) continue;

    for (const [size, data] of Object.entries(sizeResults)) {
      if (size === baselineSize || !data || !data.results) continue;

      if (!summaries[size]) {
        summaries[size] = {
          improvements: [],
          regressions: [],
          neutral: [],
        };
      }

      for (const result of data.results) {
        const baselineResult = baselineData.results.find(r => r.name === result.name);
        if (!baselineResult) continue;

        const improvement = calculateImprovement(baselineResult.mean, result.mean);
        if (improvement === null) continue;

        const entry = {
          benchmark: benchName,
          test: result.name,
          improvement,
          baselineMs: baselineResult.mean,
          currentMs: result.mean,
        };

        if (improvement > 5) {
          summaries[size].improvements.push(entry);
        } else if (improvement < -5) {
          summaries[size].regressions.push(entry);
        } else {
          summaries[size].neutral.push(entry);
        }
      }
    }
  }

  for (const [size, summary] of Object.entries(summaries)) {
    console.log(`\n📊 UV_THREADPOOL_SIZE=${size} vs baseline (${baselineSize}):`);
    console.log('─'.repeat(60));

    const total = summary.improvements.length + summary.regressions.length + summary.neutral.length;

    console.log(`   ✅ Improvements (>5% faster): ${summary.improvements.length}/${total}`);
    console.log(`   ❌ Regressions (>5% slower):  ${summary.regressions.length}/${total}`);
    console.log(`   ➖ Neutral (within ±5%):      ${summary.neutral.length}/${total}`);

    if (summary.improvements.length > 0) {
      console.log('\n   Top improvements:');
      const sorted = summary.improvements.sort((a, b) => b.improvement - a.improvement);
      for (const entry of sorted.slice(0, 5)) {
        console.log(
          `      ${entry.test.slice(0, 40).padEnd(42)} ${formatImprovement(entry.improvement)}`
        );
      }
    }

    if (summary.regressions.length > 0) {
      console.log('\n   Regressions:');
      const sorted = summary.regressions.sort((a, b) => a.improvement - b.improvement);
      for (const entry of sorted.slice(0, 5)) {
        console.log(
          `      ${entry.test.slice(0, 40).padEnd(42)} ${formatImprovement(entry.improvement)}`
        );
      }
    }

    // Calculate overall average improvement
    const allImprovements = [
      ...summary.improvements,
      ...summary.regressions,
      ...summary.neutral,
    ].map(e => e.improvement);

    if (allImprovements.length > 0) {
      const avgImprovement = allImprovements.reduce((a, b) => a + b, 0) / allImprovements.length;
      console.log(`\n   Average improvement: ${formatImprovement(avgImprovement)}`);
    }
  }
}

function printRecommendations(allResults, baselineSize) {
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));

  const autoSize = getAutoSize();
  console.log(`\n📌 Your system's auto threadpool size: ${autoSize}`);

  const autoResults = allResults.benchmarks;
  let hasAutoData = false;

  for (const benchData of Object.values(autoResults)) {
    if (benchData['auto'] && !benchData['auto'].error) {
      hasAutoData = true;
      break;
    }
  }

  if (hasAutoData) {
    console.log(`\n✅ Auto-sizing results are available in the comparison above.`);
  }

  console.log(`
💡 Key considerations for PR #61533:

1. PERFORMANCE IMPROVEMENTS expected when:
   - Running many concurrent async operations (fs, crypto, dns, zlib)
   - System has many CPU cores (your system: ${allResults.system.cpus} CPUs, ${allResults.system.availableParallelism} parallelism)
   - Workloads are I/O-bound or crypto-heavy

2. POTENTIAL DRAWBACKS to watch:
   - Slightly higher baseline memory usage (more thread stacks)
   - Possible increased context switching on small core counts
   - May not help single-threaded or synchronous workloads

3. TESTING RECOMMENDATIONS:
   - Run the memory benchmark to check overhead
   - Test with your actual application workloads
   - Compare 'auto' results with baseline (4)

4. If you see REGRESSIONS with auto-sizing:
   - You can still set UV_THREADPOOL_SIZE explicitly
   - The change respects existing env var settings
  `);
}

async function main() {
  const config = parseArgs();

  console.log('='.repeat(80));
  console.log('UV_THREADPOOL_SIZE BENCHMARK COMPARISON');
  console.log('='.repeat(80));

  // Load results
  let allResults;
  const combinedPath = path.join(config.resultsDir, 'all-results.json');

  try {
    const content = await fs.readFile(combinedPath, 'utf-8');
    allResults = JSON.parse(content);
  } catch (e) {
    console.error(`\n❌ Could not load results from ${combinedPath}`);
    console.error('   Run the benchmarks first with: node run-all-benchmarks.js');
    process.exit(1);
  }

  console.log(`\nLoaded results from: ${combinedPath}`);
  console.log(`Timestamp: ${allResults.timestamp}`);
  console.log(`Baseline: UV_THREADPOOL_SIZE=${config.baseline}`);

  // System info
  console.log(`\n🖥️  System: ${allResults.system.platform} ${allResults.system.arch}`);
  console.log(`   CPUs: ${allResults.system.cpus}, Parallelism: ${allResults.system.availableParallelism}`);
  console.log(`   Node.js: ${allResults.system.nodeVersion}`);
  console.log(`   Auto threadpool size: ${allResults.system.autoThreadpoolSize}`);

  // Print detailed comparisons
  for (const [benchName, sizeResults] of Object.entries(allResults.benchmarks)) {
    printComparisonTable(benchName, config.baseline, sizeResults);
  }

  // Print summary
  printSummaryTable(allResults, config.baseline);

  // Print recommendations
  printRecommendations(allResults, config.baseline);
}

main().catch(console.error);
