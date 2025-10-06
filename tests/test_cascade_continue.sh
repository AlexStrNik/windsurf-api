#!/bin/bash

# First request - creates a new cascade
echo "Creating new cascade..."
RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "What is 2+2?"}')

echo "Response: $RESPONSE"

# Extract cascadeId from response
CASCADE_ID=$(echo $RESPONSE | grep -o '"cascadeId":"[^"]*"' | sed 's/"cascadeId":"\([^"]*\)"/\1/')

echo "Cascade ID: $CASCADE_ID"
echo ""
echo "Continuing the same cascade..."

# Second request - continues the same cascade
curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"What is 3+3?\", \"cascadeId\": \"$CASCADE_ID\"}"
