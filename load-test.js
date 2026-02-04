#!/usr/bin/env node

import autocannon from 'autocannon';

const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
}

const config = {
  url: getArg('--url', 'http://localhost:3000'),
  duration: parseInt(getArg('--duration', '120'), 10),
  connections: parseInt(getArg('--connections', '100'), 10),
  pipelining: parseInt(getArg('--pipelining', '1'), 10),
  route: getArg('--route', null),
};

const routes = ['/crypto', '/fs', '/mixed'];

async function testRoute(route) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing route: ${route}`);
  console.log('='.repeat(60));

  const result = await autocannon({
    url: `${config.url}${route}`,
    duration: config.duration,
    connections: config.connections,
    pipelining: config.pipelining,
  });

  return {
    route,
    result,
  };
}

async function getMetrics() {
  try {
    const response = await fetch(`${config.url}/metrics`);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.error('Failed to fetch metrics:', err.message);
  }
  return null;
}

async function main() {
  console.log('Autocannon Load Test');
  console.log('='.repeat(60));
  console.log(`Server URL: ${config.url}`);
  console.log(`Duration per route: ${config.duration}s`);
  console.log(`Connections: ${config.connections}`);
  console.log(`Pipelining: ${config.pipelining}`);
  console.log('='.repeat(60));

  const routesToTest = config.route ? [config.route] : routes;
  const results = [];

  for (const route of routesToTest) {
    const testResult = await testRoute(route);
    results.push(testResult);
  }

  console.log('\n\n');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const { route, result } of results) {
    console.log(`\nRoute: ${route}`);
    console.log(`  Requests:       ${result.requests.total}`);
    console.log(`  Throughput:     ${result.throughput.mean.toFixed(2)} req/sec`);
    console.log(`  Latency (avg):  ${result.latency.mean.toFixed(2)} ms`);
    console.log(`  Latency (p99):  ${result.latency.p99.toFixed(2)} ms`);
    console.log(`  Errors:         ${result.errors}`);
    console.log(`  Timeouts:       ${result.timeouts}`);
  }

  const metrics = await getMetrics();
  if (metrics) {
    console.log('\n' + '='.repeat(60));
    console.log('SERVER METRICS');
    console.log('='.repeat(60));
    console.log(`UV_THREADPOOL_SIZE: ${metrics.threadpoolSize}`);
    console.log(`Uptime:             ${(metrics.uptime / 1000).toFixed(2)}s`);
    console.log(`Total Requests:     ${metrics.requests}`);
    console.log(`Errors:             ${metrics.errors}`);
    console.log(`Memory RSS:         ${(metrics.memory.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Used:          ${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`CPU User:           ${(metrics.cpu.user / 1000).toFixed(2)} ms`);
    console.log(`CPU System:         ${(metrics.cpu.system / 1000).toFixed(2)} ms`);
  }

  console.log('\n');
}

main().catch(console.error);
