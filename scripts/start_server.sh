#!/bin/bash
# Start the AI Digital Tour Guide API server

cd "$(dirname "$0")/.."
source venv/Scripts/activate
export HF_ENDPOINT=https://hf-mirror.com

echo "Starting AI Digital Tour Guide server..."
echo "API docs: http://localhost:8000/docs"
echo ""

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
