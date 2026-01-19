#!/bin/bash
# Talos Procurement AI Platform - Startup Script
# Runs both TypeScript and Python servers concurrently

set -e

echo "🚀 Starting Talos Procurement AI Platform..."

# Function to handle shutdown
cleanup() {
    echo "🛑 Shutting down services..."
    kill $NODE_PID $PYTHON_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start TypeScript/Hono server
echo "📦 Starting TypeScript API server on port 3000..."
node dist/server.js &
NODE_PID=$!

# Wait a bit for the Node server to start
sleep 2

# Start Python/FastAPI server
echo "🐍 Starting Python API server on port 8000..."
cd /app/python && uvicorn api.main:app --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!

echo "✅ Both servers started successfully!"
echo "   - TypeScript API: http://localhost:3000"
echo "   - Python API: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
