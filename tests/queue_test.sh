#!/bin/bash

echo "=== Queue Test - Sending 5 messages ==="
echo ""

# Send 5 messages to the same cascade
echo "Sending message 1..."
RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Message 1: What is 1+1?"}')

CASCADE_ID=$(echo "$RESPONSE" | jq -r '.cascadeId')
echo "Created cascade: $CASCADE_ID"
echo "Status: $(echo "$RESPONSE" | jq -r '.status')"
echo ""

for i in {2..5}; do
  echo "Sending message $i..."
  RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"Message $i: What is $i+$i?\", \"cascadeId\": \"$CASCADE_ID\"}")

  echo "Status: $(echo "$RESPONSE" | jq -r '.status'), Queue position: $(echo "$RESPONSE" | jq -r '.queuePosition')"
done

echo ""
echo "=== Monitoring queue every 10s until empty ==="
echo ""

while true; do
  QUEUE=$(curl -s "http://localhost:47923/queue?cascadeId=$CASCADE_ID")
  LENGTH=$(echo "$QUEUE" | jq -r '.length')

  echo "[$(date +%H:%M:%S)] Queue length: $LENGTH"

  if [ "$LENGTH" -eq 0 ]; then
    echo "Queue is empty!"
    break
  fi

  echo "$QUEUE" | jq -r '.queue[] | "  - Message \(.messageId | .[0:8])... : \(.status)"'
  echo ""

  sleep 10
done
