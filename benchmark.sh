#!/bin/bash
set -e

# Configuration
REPO_URL="https://github.com/RafaelGSS/uv-threadpool-benchmark.git"
DIR="uv-threadpool-benchmark"
DURATION=${1:-30}

# Source or Install NVM
export NVM_DIR="$HOME/.nvm"

if [ ! -d "$NVM_DIR" ]; then
    echo "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    fi
fi

check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed."
        exit 1
    fi
}

check_cmd git

if [ -d "$DIR" ]; then
    echo "Cleaning up existing directory..."
    rm -rf "$DIR"
fi

echo "Cloning repository..."
git clone "$REPO_URL" "$DIR"
cd "$DIR"

nvm install 24
nvm use 24

echo "Installing dependencies..."
npm install

# Reassemble binary if parts exist
if [ ! -f "./node-61533" ]; then
    if ls node-bin-part-* 1> /dev/null 2>&1; then
        echo "Reassembling custom binary from parts..."
        cat node-bin-part-* > node-61533
    fi
fi

if [ -f "./node-61533" ]; then
    echo ""
    echo "PHASE 1: Running Benchmark with Custom Binary (node-61533)"
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
echo "PHASE 2: Running Benchmark with Node.js v24"

echo "Installing/Switching to Node.js v24..."
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
