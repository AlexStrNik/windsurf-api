const fs = require("fs");
const path = require("path");

const chat = fs.readFileSync(path.join(__dirname, "chat.js"), "utf-8");

const serviceRegex = /const ([a-zA-Z0-9_\$]+) = \{\s*typeName:/g;

const serviceNames = [...chat.matchAll(serviceRegex)].map((match) => match[1]);

const exportString = `module.exports = { ${serviceNames.join(", ")} };`;

console.log(exportString);
