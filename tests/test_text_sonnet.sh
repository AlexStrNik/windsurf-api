#!/bin/bash

curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Sonnet 4.5", "model": "Claude Sonnet 4.5 (promo)"}'
