#!/bin/bash
set -e

REPO_URL="https://github.com/RafaelGSS/uv-threadpool-benchmark.git"
DIR="uv-threadpool-benchmark"
DURATION=${1:-30}

check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed."
        exit 1
    fi
}

check_cmd node
check_cmd npm
check_cmd git

if [ -d "$DIR" ]; then
    rm -rf "$DIR"
fi

echo "Cloning repository..."
git clone "$REPO_URL" "$DIR"
cd "$DIR"

echo "Installing dependencies..."
npm install

echo "Starting server..."
npm start > server.log 2>&1 &
SERVER_PID=$!
sleep 5

echo "Running benchmark (Duration: ${DURATION}s)..."
if npm run load-test -- --duration "$DURATION"; then
    echo "Benchmark completed successfully."
else
    echo "Benchmark failed."
    cat server.log
fi

kill "$SERVER_PID"
