const fs = require("fs");
const path = require("path");

const inputPath =
  process.argv[2] ?? path.join(__dirname, "workbench.desktop.main.js");
const outputPath =
  process.argv[3] ?? path.join(__dirname, "workbench.desktop.main.protos.js");

const source = fs.readFileSync(inputPath, "utf8");

const isIdentChar = (ch) => /[A-Za-z0-9_$]/.test(ch);

const skipStringOrComment = (s, i) => {
  const ch = s[i];

  if (ch === "'" || ch === '"' || ch === "`") {
    const quote = ch;
    i++;
    while (i < s.length) {
      const c = s[i];
      if (c === "\\") {
        i += 2;
        continue;
      }

      if (quote === "`" && c === "$" && s[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < s.length && depth > 0) {
          const inner = s[i];

          if (
            inner === "'" ||
            inner === '"' ||
            inner === "`" ||
            inner === "/"
          ) {
            const next = skipStringOrComment(s, i);
            if (next > i) {
              i = next;
              continue;
            }
          }

          if (inner === "{") {
            depth++;
          } else if (inner === "}") {
            depth--;
          }

          i++;
        }
        continue;
      }

      if (c === quote) {
        i++;
        break;
      }
      i++;
    }
    return i;
  }

  if (ch === "/") {
    const next = s[i + 1];
    if (next === "/") {
      i += 2;
      while (i < s.length && s[i] !== "\n") {
        i++;
      }
      return i;
    }
    if (next === "*") {
      i += 2;
      while (i < s.length) {
        if (s[i] === "*" && s[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      return i;
    }
  }

  return i;
};

const findMatchingBrace = (s, openIndex) => {
  let i = openIndex;
  if (s[i] !== "{") {
    throw new Error("expected {");
  }

  let depth = 0;
  while (i < s.length) {
    const ch = s[i];

    if (ch === "'" || ch === '"' || ch === "`" || ch === "/") {
      const next = skipStringOrComment(s, i);
      if (next > i) {
        i = next;
        continue;
      }
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }

    i++;
  }

  throw new Error("unmatched brace");
};

const extractAssignmentBlock = (startIndex) => {
  let i = startIndex;

  while (i > 0 && /\s/.test(source[i - 1])) {
    i--;
  }

  let identEnd = i;
  let identStart = identEnd;
  while (identStart > 0 && isIdentChar(source[identStart - 1])) {
    identStart--;
  }

  const varName = source.slice(identStart, identEnd);

  let j = startIndex;
  while (j < source.length && source[j] !== "=") {
    j++;
  }
  if (source[j] !== "=") {
    throw new Error("expected =");
  }

  j++;
  while (j < source.length && /\s/.test(source[j])) {
    j++;
  }

  if (source.slice(j, j + 5) === "class") {
    const openBrace = source.indexOf("{", j);
    const closeBrace = findMatchingBrace(source, openBrace);

    let end = closeBrace + 1;
    while (end < source.length && /\s/.test(source[end])) {
      end++;
    }
    if (source[end] === ",") {
      end++;
    }

    const rhs = source.slice(j, closeBrace + 1);
    return { varName, rhs, end };
  }

  if (source[j] === "{") {
    const closeBrace = findMatchingBrace(source, j);

    let end = closeBrace + 1;
    while (end < source.length && /\s/.test(source[end])) {
      end++;
    }
    if (source[end] === ",") {
      end++;
    }

    const rhs = source.slice(j, closeBrace + 1);
    return { varName, rhs, end };
  }

  return null;
};

const extracted = {
  messageAssignments: [],
  enumCalls: [],
  serviceAssignments: [],
  aliasAssignments: [],
};

const seenVars = new Set();
const seenAliasNames = new Set();

const pushVar = (arr, name, rhs) => {
  if (!name || seenVars.has(name)) {
    return;
  }
  seenVars.add(name);
  arr.push({ name, rhs });
};

const pushAlias = (name, target) => {
  if (!name || seenAliasNames.has(name)) {
    return;
  }
  seenAliasNames.add(name);
  extracted.aliasAssignments.push({ name, target });
};

for (let i = 0; i < source.length; i++) {
  const ch = source[i];
  if (ch === "'" || ch === '"' || ch === "`" || ch === "/") {
    const next = skipStringOrComment(source, i);
    if (next > i) {
      i = next - 1;
      continue;
    }
  }

  if (ch === "=") {
    let t = i + 1;
    while (t < source.length && /\s/.test(source[t])) {
      t++;
    }

    if (
      source.slice(t, t + 5) === "class" &&
      source.slice(t, t + 400).includes("extends Message")
    ) {
      let identEnd = i;
      let b = i - 1;
      while (b >= 0 && /\s/.test(source[b])) {
        b--;
      }
      identEnd = b + 1;
      let identStart = identEnd;
      while (identStart > 0 && isIdentChar(source[identStart - 1])) {
        identStart--;
      }

      const name = source.slice(identStart, identEnd);
      if (name && /[A-Za-z_$]/.test(name[0])) {
        const block = extractAssignmentBlock(identEnd);
        if (block) {
          pushVar(extracted.messageAssignments, block.varName, block.rhs);
          i = block.end - 1;
          continue;
        }
      }
    }

    if (/[A-Za-z_$]/.test(source[t])) {
      let u = t + 1;
      while (u < source.length && isIdentChar(source[u])) {
        u++;
      }
      const target = source.slice(t, u);

      if (target.startsWith("$")) {
        let identEnd = i;
        let b = i - 1;
        while (b >= 0 && /\s/.test(source[b])) {
          b--;
        }
        identEnd = b + 1;
        let identStart = identEnd;
        while (identStart > 0 && isIdentChar(source[identStart - 1])) {
          identStart--;
        }

        const name = source.slice(identStart, identEnd);
        if (name && /^[A-Z][A-Za-z0-9_]*$/.test(name)) {
          pushAlias(name, target);
        }
      }
    }
  }

  if (
    source.startsWith("const ", i) ||
    source.startsWith("let ", i) ||
    source.startsWith("var ", i)
  ) {
    const keywordLen = source.startsWith("const ", i)
      ? 5
      : source.startsWith("let ", i)
        ? 3
        : 3;

    let j = i + keywordLen;
    while (j < source.length && /\s/.test(source[j])) {
      j++;
    }

    if (source[j] !== "{" && source[j] !== "[") {
      const identStart = j;
      if (/[A-Za-z_$]/.test(source[identStart])) {
        j++;
        while (j < source.length && isIdentChar(source[j])) {
          j++;
        }

        const name = source.slice(identStart, j);
        let k = j;
        while (k < source.length && /\s/.test(source[k])) {
          k++;
        }

        if (source[k] === "=") {
          let t = k + 1;
          while (t < source.length && /\s/.test(source[t])) {
            t++;
          }

          if (
            source.slice(t, t + 5) === "class" &&
            source.slice(t, t + 400).includes("extends Message")
          ) {
            const block = extractAssignmentBlock(j);
            if (block) {
              pushVar(extracted.messageAssignments, block.varName, block.rhs);
              i = block.end - 1;
              continue;
            }
          }

          if (/[A-Za-z_$]/.test(source[t])) {
            let u = t + 1;
            while (u < source.length && isIdentChar(source[u])) {
              u++;
            }
            const target = source.slice(t, u);
            pushAlias(name, target);
          }
        }
      }
    }
  }

  if (ch === "$") {
    let j = i + 1;
    while (j < source.length && isIdentChar(source[j])) {
      j++;
    }

    const name = source.slice(i, j);
    let k = j;
    while (k < source.length && /\s/.test(source[k])) {
      k++;
    }

    if (source[k] === "=") {
      let t = k + 1;
      while (t < source.length && /\s/.test(source[t])) {
        t++;
      }

      if (
        source.slice(t, t + 5) === "class" &&
        source.slice(t, t + 80).includes("extends Message")
      ) {
        const block = extractAssignmentBlock(j);
        if (block) {
          pushVar(extracted.messageAssignments, block.varName, block.rhs);
          i = block.end - 1;
          continue;
        }
      }

      if (
        source[t] === "{" &&
        source.slice(t, t + 200).includes("typeName") &&
        source.slice(t, t + 200).includes('"exa')
      ) {
        const block = extractAssignmentBlock(j);
        if (block) {
          pushVar(extracted.serviceAssignments, block.varName, block.rhs);
          i = block.end - 1;
          continue;
        }
      }
    }
  }

  if (source.startsWith("proto3.util.setEnumType(", i)) {
    const callStart = i;
    let j = i;
    while (j < source.length && source[j] !== "(") {
      j++;
    }

    let parenDepth = 0;
    while (j < source.length) {
      const c = source[j];

      if (c === "'" || c === '"' || c === "`" || c === "/") {
        const next = skipStringOrComment(source, j);
        if (next > j) {
          j = next;
          continue;
        }
      }

      if (c === "(") {
        parenDepth++;
      } else if (c === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          j++;
          break;
        }
      }

      j++;
    }

    while (j < source.length && /\s/.test(source[j])) {
      j++;
    }
    if (source[j] === ";") {
      j++;
    }

    const stmt = source.slice(callStart, j);
    if (stmt.includes('"exa')) {
      extracted.enumCalls.push(stmt);
    }

    i = j - 1;
  }
}

const serviceExportNames = extracted.serviceAssignments.map((s) => s.name);

const enumVarNames = Array.from(
  new Set(
    extracted.enumCalls
      .map((stmt) => {
        const m = stmt.match(
          /proto3\.util\.setEnumType\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/
        );
        return m?.[1];
      })
      .filter(Boolean)
  )
);

const extractedMessageVarNames = new Set(
  extracted.messageAssignments.map((m) => m.name)
);
const extractedEnumVarNames = new Set(enumVarNames);

const filteredAliasAssignments = extracted.aliasAssignments.filter(({ name, target }) => {
  if (!target || typeof target !== "string") {
    return false;
  }

  const looksLikeTypeName =
    typeof name === "string" &&
    /^[A-Z][A-Za-z0-9_]*$/.test(name) &&
    (/[a-z]/.test(name) || name.length > 2);

  if (!looksLikeTypeName) {
    return false;
  }

  return extractedMessageVarNames.has(target) || extractedEnumVarNames.has(target);
});

const declaredNames = new Set([
  ...extracted.messageAssignments.map((m) => m.name),
  ...filteredAliasAssignments.map((a) => a.name),
  ...extracted.serviceAssignments.map((s) => s.name),
]);

const out = [];
out.push(`
class Message {
  constructor() {}
  fromBinary() { return this; }
  fromJson() { return this; }
  fromJsonString() { return this; }
}

const proto3 = {
  getEnumType: (t) => t,
  getMessageType: (t) => t,
  util: {
    initPartial: () => {},
    newFieldList: (fn) => ({
      list: () => fn().map((f) => ({ repeated: !!f.repeated, ...f })),
    }),
    equals: () => false,
    setEnumType: (enumObj, typeName, values) => {
      enumObj.typeName = typeName;
      enumObj.values = values;
      return enumObj;
    },
  },
};
`);

if (!declaredNames.has("MethodKind") && !enumVarNames.includes("MethodKind")) {
  out.push(`
const MethodKind = { Unary: 0, ClientStreaming: 1, ServerStreaming: 2, BiDiStreaming: 3 };
`);
}

for (const { name, rhs } of extracted.messageAssignments) {
  out.push(`const ${name} = ${rhs};`);
}

out.push("");

const googleWellKnownMessages = [
  ["Timestamp", "google.protobuf.Timestamp"],
  ["Duration", "google.protobuf.Duration"],
  ["Empty", "google.protobuf.Empty"],
];

for (const [varName, typeName] of googleWellKnownMessages) {
  if (declaredNames.has(varName)) {
    out.push(
      `if (typeof ${varName}.typeName !== "string") ${varName}.typeName = "${typeName}";`
    );
    out.push(
      `if (typeof ${varName}.fields?.list !== "function") ${varName}.fields = { list: () => [] };`
    );
  }
}

out.push("");

for (const { name, target } of filteredAliasAssignments) {
  out.push(`const ${name} = ${target};`);
}

out.push("");

for (const name of enumVarNames) {
  if (!declaredNames.has(name)) {
    out.push(`const ${name} = {};`);
  }
}

out.push("");

for (const stmt of extracted.enumCalls) {
  out.push(stmt);
}

out.push("");

for (const { name, rhs } of extracted.serviceAssignments) {
  out.push(`const ${name} = ${rhs};`);
}

out.push("");
out.push(`module.exports = { ${serviceExportNames.join(", ")} };`);
out.push("");

fs.writeFileSync(outputPath, out.join("\n"));

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      messages: extracted.messageAssignments.length,
      enums: extracted.enumCalls.length,
      services: extracted.serviceAssignments.length,
    },
    null,
    2
  )
);
