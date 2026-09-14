#!/bin/bash
# MEDRIPPLE Railway Startup Script

set -e

echo "=== Starting MEDRIPPLE on Railway ==="

# Start Python AI service in background
cd /app/intelligence
. venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
AI_PID=$!

echo "AI service started (PID: $AI_PID)"

# Wait for AI to be ready
sleep 5

# Start Node.js backend
cd /app/backend
npm start &
BACKEND_PID=$!

echo "Backend started (PID: $BACKEND_PID)"

# Keep container running and monitor processes
wait $AI_PID $BACKEND_PID
