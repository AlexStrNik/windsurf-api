#!/bin/bash

curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from API test"}'
