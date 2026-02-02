# UV_THREADPOOL_SIZE Benchmark Suite

Benchmark project for testing the performance implications of [nodejs/node#61533](https://github.com/nodejs/node/pull/61533), which auto-sizes `UV_THREADPOOL_SIZE` based on available CPU parallelism.

## What This PR Changes

**Before (current behavior):**
- libuv's threadpool defaults to 4 threads

**After (PR #61533):**
- Node.js auto-sizes the threadpool to `min(max(4, os.availableParallelism()), 1024)`
- Only when `UV_THREADPOOL_SIZE` is not already set

## Operations Affected

The libuv threadpool is used for:
- **File System**: Async fs operations (`fs.readFile`, `fs.writeFile`, `fs.stat`, etc.)
- **Crypto**: `crypto.pbkdf2`, `crypto.scrypt`, `crypto.randomFill`
- **DNS**: `dns.lookup()` (not `dns.resolve()` which uses c-ares)
- **Zlib**: Async compression (`zlib.gzip`, `zlib.deflate`, `zlib.brotliCompress`, etc.)

## Quick Start

```bash
# Run all benchmarks comparing default (4) vs auto-sized threadpool
node run-all-benchmarks.js

# Compare results
node compare-results.js
```

## Available Benchmarks

| Benchmark | Description |
|-----------|-------------|
| `fs` | File system operations (read, write, stat) |
| `crypto` | Cryptographic operations (pbkdf2, scrypt, randomFill) |
| `dns` | DNS lookups |
| `zlib` | Compression/decompression (gzip, deflate, brotli) |
| `mixed` | Realistic mixed workloads simulating real applications |
| `memory` | Memory overhead analysis |

## Running Individual Benchmarks

```bash
# Run with default threadpool (4)
UV_THREADPOOL_SIZE=4 node benchmarks/fs-operations.js

# Run with auto-sized threadpool (simulating PR behavior)
node benchmarks/fs-operations.js  # Without setting UV_THREADPOOL_SIZE

# Run with specific size
UV_THREADPOOL_SIZE=16 node benchmarks/crypto-operations.js
```

## Using npm Scripts

```bash
npm run bench:fs      # File system benchmark
npm run bench:crypto  # Crypto benchmark
npm run bench:dns     # DNS benchmark
npm run bench:zlib    # Zlib benchmark
npm run bench:mixed   # Mixed workload benchmark
npm run bench:all     # Run all benchmarks
npm run memory        # Memory usage analysis
npm run compare       # Compare results
```

## Advanced Usage

### Test Multiple Threadpool Sizes

```bash
node run-all-benchmarks.js --sizes 4,8,16,32,auto
```

### Run Specific Benchmarks

```bash
node run-all-benchmarks.js --benchmarks fs,crypto --sizes 4,auto
```

### Custom Output Directory

```bash
node run-all-benchmarks.js --output ./my-results
```

## Interpreting Results

### What to Look For

1. **Improvements**: Operations completing faster with larger threadpool
   - Expected for concurrent I/O operations
   - Most noticeable with high concurrency levels

2. **Regressions**: Operations completing slower
   - May occur due to thread contention
   - More likely with CPU-bound operations on low core counts

3. **Memory Overhead**: More threads = more memory
   - Each thread has a stack (typically 1-8MB)
   - Run `npm run memory` to measure

### Key Metrics

- **Mean/Median**: Average and middle execution times
- **P95/P99**: Tail latency (important for production)
- **Std Dev**: Consistency of results

## Testing Against PR Branch

To test with the actual PR changes:

```bash
# Clone Node.js and checkout the PR
git clone https://github.com/nodejs/node.git
cd node
git fetch origin pull/61533/head:pr-61533
git checkout pr-61533

# Build Node.js
./configure && make -j$(nproc)

# Run benchmarks with built Node.js
cd /path/to/uv-threadpool-benchmark
/path/to/node/out/Release/node run-all-benchmarks.js
```

## Example Results

```
📊 UV_THREADPOOL_SIZE=auto vs baseline (4):
─────────────────────────────────────────────────────────────
   ✅ Improvements (>5% faster): 18/30
   ❌ Regressions (>5% slower):  2/30
   ➖ Neutral (within ±5%):      10/30

   Top improvements:
      Concurrent reads (100 files)                    +45.2%
      PBKDF2 (64 concurrent, 10000 iterations)        +38.7%
      gzip compress (32x, 100.00 KB, high)            +31.4%
```

## Potential Drawbacks

1. **Memory Usage**: More threads consume more memory
2. **Thread Contention**: On systems with few cores, more threads may cause contention
3. **Context Switching**: Overhead from managing more threads
4. **Not Always Beneficial**: Single-threaded or synchronous workloads won't benefit

## Contributing

Feel free to add more benchmarks or improve existing ones. The key files are:

- `lib/utils.js` - Shared utilities
- `benchmarks/*.js` - Individual benchmark files
- `run-all-benchmarks.js` - Benchmark runner
- `compare-results.js` - Results comparison tool
