#!/usr/bin/env node

const { fromBinary } = require("@bufbuild/protobuf");
const { SendUserCascadeMessageRequestSchema } = require("../out/gen/exa.language_server_pb_pb");

const base64Input = process.argv[2];

if (!base64Input) {
  console.error("Usage: node decode_request.js <base64-encoded-request>");
  console.error("Example: node decode_request.js CiRjMDNiZDQ4YS1hMDUwLTRiNzktYmE0Mi0wMTkxMGUzNTZmYjk=");
  process.exit(1);
}

try {
  const buffer = Buffer.from(base64Input, 'base64');

  console.log("=== BUFFER INFO ===");
  console.log("Length:", buffer.length, "bytes");
  console.log("Hex:", buffer.toString('hex'));
  console.log();

  const message = fromBinary(SendUserCascadeMessageRequestSchema, new Uint8Array(buffer));

  console.log("=== DECODED MESSAGE ===");
  console.log(JSON.stringify(message, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, 2));

} catch (error) {
  console.error("Error decoding message:", error.message);
  process.exit(1);
}
