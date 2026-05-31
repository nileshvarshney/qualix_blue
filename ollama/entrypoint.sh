#!/bin/bash
set -e

MODEL=${OLLAMA_MODEL:-qwen2.5:3b}

echo "Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!

echo "Waiting for Ollama to be ready..."
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
    sleep 1
done

echo "Pulling model: $MODEL"
ollama pull "$MODEL"
echo "Model ready."

wait $OLLAMA_PID
