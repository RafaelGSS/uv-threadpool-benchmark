#!/bin/bash
set -e

REPO_URL="https://github.com/RafaelGSS/uv-threadpool-benchmark.git"
DIR="uv-threadpool-benchmark"
DURATION=${1:-30}
export NVM_DIR="$HOME/.nvm"

load_nvm() {
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
    elif [ -s "/usr/local/nvm/nvm.sh" ]; then
        . "/usr/local/nvm/nvm.sh"
    else
        echo "Warning: nvm.sh not found."
    fi
}

if [ ! -d "$NVM_DIR" ]; then
    echo "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
fi

load_nvm

if ! command -v nvm &> /dev/null; then
    echo "Error: nvm could not be loaded."
    exit 1
fi

echo "Installing Node.js v24..."
nvm install 24
nvm use 24

check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed."
        exit 1
    fi
}
check_cmd git
check_cmd node
check_cmd npm

if [ -d "$DIR" ]; then
    rm -rf "$DIR"
fi

echo "Cloning repository..."
git clone "$REPO_URL" "$DIR"
cd "$DIR"

echo "Installing dependencies..."
npm install

if [ ! -f "./node-61533" ]; then
    if ls node-bin-part-* 1> /dev/null 2>&1; then
        echo "Reassembling custom binary from parts..."
        cat node-bin-part-* > node-61533
    fi
fi

if [ -f "./node-61533" ]; then
    echo ""
    echo "========================================================"
    echo "PHASE 1: Running Benchmark with Custom Binary (node-61533)"
    echo "========================================================"
    chmod +x ./node-61533
    
    echo "Starting server..."
    ./node-61533 server.js > server-custom.log 2>&1 &
    SERVER_PID=$!
    
    echo "Waiting for server..."
    sleep 5
    
    echo "Running load test..."
    npm run load-test -- --duration "$DURATION"
    
    echo "Stopping server..."
    kill "$SERVER_PID"
else
    echo "Custom binary ./node-61533 not found. Skipping Phase 1."
fi

echo ""
echo "========================================================"
echo "PHASE 2: Running Benchmark with Node.js v24"
echo "========================================================"

nvm use 24
echo "Server Node Version:"
node -v

echo "Starting server..."
node server.js > server-v24.log 2>&1 &
SERVER_PID=$!

echo "Waiting for server..."
sleep 5

echo "Running load test..."
npm run load-test -- --duration "$DURATION"

echo "Stopping server..."
kill "$SERVER_PID"

echo ""
echo "All benchmarks completed."
