#!/bin/bash

# Show list of trajectories
echo "=== Available Conversations ==="
TRAJECTORIES=$(curl -s http://localhost:47923/trajectories)
echo "$TRAJECTORIES" | jq -r '.[] | "\(.cascadeId) - \(.name)"'
echo ""

# Get cascade ID from user
echo "Enter cascadeId to continue (or press Enter to create new):"
read CASCADE_ID

# Get message from user
echo "Enter your message:"
read MESSAGE

# Send prompt
if [ -z "$CASCADE_ID" ]; then
  echo "Creating new conversation..."
  RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$MESSAGE\"}")
else
  echo "Continuing conversation $CASCADE_ID..."
  RESPONSE=$(curl -s -X POST http://localhost:47923/prompt \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$MESSAGE\", \"cascadeId\": \"$CASCADE_ID\"}")
fi

echo ""
echo "Response:"
echo "$RESPONSE" | jq '.'
