#!/bin/bash

curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from SWE-1", "model": "SWE-1"}'
