# UV_THREADPOOL_SIZE Benchmark Server

HTTP server for benchmarking [nodejs/node#61533](https://github.com/nodejs/node/pull/61533) with wrk2.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/crypto` | PBKDF2 hashing - 10,000 iterations (uses threadpool) |
| `/fs` | 100KB file read (uses threadpool) |
| `/mixed` | Both crypto + fs operations |
| `/metrics` | Memory/CPU/request stats |

## Usage

```bash
# With default threadpool (4 threads)
UV_THREADPOOL_SIZE=4 node server.js

# With auto-sized threadpool
node server.js

# Then run wrk2 from another terminal
wrk2 -t4 -c100 -d30s -R2000 http://localhost:3000/mixed
```

## Benchmark Script

```bash
#!/bin/bash

DURATION=30s
THREADS=4
CONNECTIONS=100
RATE=2000

for SIZE in 4 auto; do
  echo "=== UV_THREADPOOL_SIZE=$SIZE ==="

  if [ "$SIZE" = "auto" ]; then
    node server.js &
  else
    UV_THREADPOOL_SIZE=$SIZE node server.js &
  fi
  PID=$!
  sleep 2

  wrk2 -t$THREADS -c$CONNECTIONS -d$DURATION -R$RATE http://localhost:3000/mixed

  curl -s http://localhost:3000/metrics
  echo ""

  kill $PID 2>/dev/null
  sleep 2
done
```

## Metrics

After running wrk2, check `/metrics` for:

```json
{
  "uptime": 30000,
  "requests": 60000,
  "errors": 0,
  "memory": {
    "rss": 58000000,
    "heapUsed": 8000000,
    "heapTotal": 12000000
  },
  "cpu": {
    "user": 15000000,
    "system": 5000000
  },
  "threadpoolSize": "auto"
}
```
