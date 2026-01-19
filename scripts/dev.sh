#!/bin/bash
# Development startup script
# Runs TypeScript and Python servers in development mode with hot reload

set -e

echo "🔧 Starting Talos in development mode..."

# Check for required tools
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ python3 is required but not installed."; exit 1; }

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Loaded .env file"
else
    echo "⚠️  No .env file found. Copy .env.example to .env and configure it."
fi

# Function to handle shutdown
cleanup() {
    echo ""
    echo "🛑 Stopping development servers..."
    kill $TS_PID $PY_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start TypeScript server with hot reload
echo "📦 Starting TypeScript server (port 3000)..."
npm run dev &
TS_PID=$!

# Wait for TypeScript server to initialize
sleep 3

# Start Python server with hot reload
echo "🐍 Starting Python server (port 8000)..."
cd python && uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 &
PY_PID=$!
cd ..

echo ""
echo "✅ Development servers started!"
echo ""
echo "   TypeScript API: http://localhost:3000"
echo "   Python API:     http://localhost:8000"
echo "   API Docs:       http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"

# Wait for any process to exit
wait
