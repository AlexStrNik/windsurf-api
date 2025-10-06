#!/bin/bash

# Request with explicit null cascadeId - creates a new cascade
echo "Creating new cascade with explicit null..."
curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, this is a new conversation", "cascadeId": null}'
