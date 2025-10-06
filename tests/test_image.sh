#!/bin/bash

BASE64_IMAGE=$(base64 -i test.jpg)

curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"What colors are in this image?\", \"images\": [{\"base64\": \"$BASE64_IMAGE\"}]}"
