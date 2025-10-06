#!/bin/bash

echo "=== Testing Model Selection ==="
echo ""

# First, get list of available models
echo "Available models:"
MODELS=$(curl -s http://localhost:47923/models)
echo "$MODELS" | jq -r '.[]' | head -10
echo ""

# Test with Claude Sonnet 4.5
echo "Sending message with Claude Sonnet 4.5 (promo)..."
RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, using Claude Sonnet 4.5", "model": "Claude Sonnet 4.5 (promo)"}')

echo "Response:"
echo "$RESPONSE" | jq '.'
echo ""

# Test with GPT-5
echo "Sending message with GPT-5 (low reasoning)..."
RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, using GPT-5", "model": "GPT-5 (low reasoning)"}')

echo "Response:"
echo "$RESPONSE" | jq '.'
echo ""

# Test with o3
echo "Sending message with SWE-1..."
RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, using SWE-1", "model": "SWE-1"}')

echo "Response:"
echo "$RESPONSE" | jq '.'
