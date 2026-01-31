const fs = require("fs");
const path = require("path");
const crypto = require("crypto")

const ensureDirEmpty = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
};

const safeCopyFile = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};

const appendVersionMetadata = (versionFilePath, lines) => {
  fs.mkdirSync(path.dirname(versionFilePath), { recursive: true });

  let prefix = "";
  if (fs.existsSync(versionFilePath)) {
    const prev = fs.readFileSync(versionFilePath, "utf8");
    if (prev.length > 0 && !prev.endsWith("\n")) {
      prefix = "\n";
    }
  }

  fs.appendFileSync(versionFilePath, prefix + lines.join("\n") + "\n", "utf8");
};

const normalizeVersionFile = (versionFilePath) => {
  if (!fs.existsSync(versionFilePath)) {
    return;
  }

  const raw = fs.readFileSync(versionFilePath, "utf8");
  const lines = raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const keyed = lines.map((line, idx) => {
    const eq = line.indexOf("=");
    const key = eq === -1 ? line : line.slice(0, eq);
    return { key, idx, line };
  });

  keyed.sort((a, b) => {
    const c = a.key.localeCompare(b.key);
    if (c !== 0) return c;
    return a.idx - b.idx;
  });

  fs.writeFileSync(
    versionFilePath,
    keyed.map((x) => x.line).join("\n") + "\n",
    "utf8"
  );
};

const WINDSURF_VERSION_PATH = "WINDSURF_VERSION";

const windsurfVersionFromDir = (dir, inputName) => {
  const versionFilePath = path.join(dir, WINDSURF_VERSION_PATH);
  if (!fs.existsSync(versionFilePath)) {
    const hash = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(dir, inputName)))
    return `${inputName}-${hash.digest("hex").slice(0, 8)}`;
  }

  const versionFileContents = fs.readFileSync(versionFilePath, "utf8");
  const lines = versionFileContents.split("\n");
  const versionLine = lines.find((line) => line.startsWith("WINDSURF_VERSION="));
  if (!versionLine) {
    throw new Error(`version file does not contain WINDSURF_VERSION: ${versionFilePath}`);
  }
  return versionLine.slice("WINDSURF_VERSION=".length).trim();
};

const findNewestDir = (dataDir, prefix) => {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`data dir not found: ${dataDir}`);
  }

  const entries = fs
    .readdirSync(dataDir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => {
      const fullPath = path.join(dataDir, name);
      try {
        const stat = fs.lstatSync(fullPath);
        return { fullPath, isDir: stat.isDirectory(), mtimeMs: stat.mtimeMs };
      } catch {
        return { fullPath, isDir: false, mtimeMs: 0 };
      }
    })
    .filter(({ isDir }) => isDir)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (entries.length === 0) {
    throw new Error(`no ${prefix} directories found under: ${dataDir}`);
  }

  return entries[0].fullPath;
};

const syncGeneratedToCanonical = (generatedDir, canonicalDir) => {
  ensureDirEmpty(canonicalDir);

  for (const name of fs.readdirSync(generatedDir)) {
    if (!name.endsWith(".proto") && name !== WINDSURF_VERSION_PATH) {
      continue;
    }
    safeCopyFile(path.join(generatedDir, name), path.join(canonicalDir, name));
  }
};

const dataDir = path.join(__dirname, "data");

const isJsInput = process.argv.length > 2 && process.argv[2].endsWith(".js")

const prepareDir = process.argv.length > 2
  ? (isJsInput ? path.dirname(process.argv[2]) : path.resolve(process.argv[2]))
  : findNewestDir(dataDir, "prepare_decompile-");

if (!fs.existsSync(prepareDir) || !fs.lstatSync(prepareDir).isDirectory()) {
  throw new Error(`prepare dir not found: ${prepareDir}`);
}

const inputName = isJsInput
  ? path.basename(process.argv[2])
  : "workbench.desktop.main.protos.js";




const windsurfVersion = windsurfVersionFromDir(prepareDir, inputName);

const buildDir = process.argv.length > 3
    ? path.resolve(process.argv[3])
    : path.join(__dirname, "data", `build_protos-${windsurfVersion}`);

ensureDirEmpty(buildDir);

const hasVersionMeta = fs.existsSync(path.join(prepareDir, WINDSURF_VERSION_PATH));
if(hasVersionMeta){
  safeCopyFile(
    path.join(prepareDir, WINDSURF_VERSION_PATH),
    path.join(buildDir, WINDSURF_VERSION_PATH)
  );
}else{
  fs.writeFileSync(
    path.join(buildDir, WINDSURF_VERSION_PATH),
    `WINDSURF_VERSION=${windsurfVersion}\n`,
    "utf8"
  );
}

const inputPath = path.join(prepareDir, inputName);

if (!fs.existsSync(inputPath) || !fs.lstatSync(inputPath).isFile()) {
  throw new Error(`input file not found: ${inputPath}`);
}

const protos = require(inputPath);

const enums = {};
const services = {};

const namespaces = {};
const namespaceImports = {};

const resolveField = (type, currentNamespace, namespaceImports) => {
  const fieldName = getFullTypeNameFromField(type);
  const fieldNamespace = getNamespaceFromTypeName(fieldName);

  if (fieldNamespace === "google.protobuf") {
    return fieldName;
  }

  if (fieldNamespace !== currentNamespace) {
    if (!namespaceImports[currentNamespace]) {
      namespaceImports[currentNamespace] = [];
    }

    if (namespaceImports[currentNamespace].includes(fieldNamespace)) {
      return fieldName;
    }

    namespaceImports[currentNamespace].push(fieldNamespace);
  }

  return fieldName;
};

const seenTypes = new Set();

const decompileProto = (proto) => {
  if (!proto?.typeName || typeof proto.fields?.list !== "function") return;

  if (!proto.typeName.startsWith("exa")) return;

  const typeName = proto.typeName.split(".").pop();
  const fields = proto.fields.list();

  if (seenTypes.has(proto.typeName)) return;

  seenTypes.add(proto.typeName);

  const namespace = getNamespaceFromTypeName(proto.typeName);
  if (!namespaces[namespace]) {
    namespaces[namespace] = [];
  }

  let messageDefinition = "";

  messageDefinition += `message ${typeName} {`;

  for (const field of fields) {
    let label = field.repeated ? "repeated " : "";
    let type;

    switch (field.kind) {
      case "scalar":
        type = scalarTypeName(field.T);
        break;
      case "message":
        decompileProto(field.T);
        type = resolveField(field.T, namespace, namespaceImports);
        break;
      case "enum":
        decompileProto(field.T);
        type = resolveField(field.T, namespace, namespaceImports);
        enums[field.T.typeName] = field.T;

        break;
      case "map":
        const keyType = scalarTypeName(field.K);
        const valueType =
          field.V.kind === "message" || field.V.kind === "enum"
            ? resolveField(field.V.T, namespace, namespaceImports)
            : scalarTypeName(field.V.T);

        if (field.V.kind === "message") {
          decompileProto(field.V.T);
        }

        if (field.V.kind === "enum") {
          enums[field.V.T.typeName] = field.V.T;
        }

        type = `map<${keyType}, ${valueType}>`;
        break;
      default:
        console.error(field);
        type = "UNKNOWN";
    }

    messageDefinition += `  ${label}${type} ${field.name} = ${field.no};\n`;
  }

  messageDefinition += "}\n";

  namespaces[namespace].push(messageDefinition);
};

const scalarTypeName = (typeId) => {
  const scalarTypes = {
    1: "double",
    2: "float",
    3: "int64",
    4: "uint64",
    5: "int32",
    6: "fixed64",
    7: "fixed32",
    8: "bool",
    9: "string",
    12: "bytes",
    13: "uint32",
    15: "sfixed32",
    16: "sfixed64",
    17: "sint32",
    18: "sint64",
  };
  return scalarTypes[typeId] || `scalar_${typeId}`;
};

const getFullTypeNameFromField = (T) => {
  if (typeof T?.typeName === "string") {
    const namespace = getNamespaceFromTypeName(T.typeName);
    const typeName = T.typeName.split(".").pop();

    return `${namespace}.${typeName}`;
  }

  return "UNKNOWN";
};

const getNamespaceFromTypeName = (typeName) => {
  const parts = typeName.split(".");
  parts.pop();

  return parts[0] + "." + parts[1];
};

const decompileService = (service) => {
  const namespace = getNamespaceFromTypeName(service.typeName);
  const serviceName = service.typeName.split(".").pop();

  if (!services[namespace]) {
    services[namespace] = [];
  }

  let serviceDefinition = `service ${serviceName} {\n`;

  for (const method of Object.values(service.methods)) {
    decompileProto(method.I);
    decompileProto(method.O);

    const inputType = getFullTypeNameFromField(method.I);
    const outputType = getFullTypeNameFromField(method.O);

    const inputNamespace = getNamespaceFromTypeName(method.I.typeName);
    const outputNamespace = getNamespaceFromTypeName(method.O.typeName);

    if (inputNamespace !== namespace) {
      if (!namespaceImports[namespace]) {
        namespaceImports[namespace] = [];
      }
      if (!namespaceImports[namespace].includes(inputNamespace)) {
        namespaceImports[namespace].push(inputNamespace);
      }
    }

    if (outputNamespace !== namespace) {
      if (!namespaceImports[namespace]) {
        namespaceImports[namespace] = [];
      }
      if (!namespaceImports[namespace].includes(outputNamespace)) {
        namespaceImports[namespace].push(outputNamespace);
      }
    }

    const isClientStreaming = method.kind === 1 || method.kind === 3;
    const isServerStreaming = method.kind === 2 || method.kind === 3;

    const inputStream = isClientStreaming ? "stream " : "";
    const outputStream = isServerStreaming ? "stream " : "";

    serviceDefinition += `  rpc ${method.name}(${inputStream}${inputType}) returns (${outputStream}${outputType});\n`;
  }

  serviceDefinition += "}\n";

  services[namespace].push(serviceDefinition);
};

for (const value of Object.values(protos)) {
  decompileService(value);
}

for (const [key, value] of Object.entries(enums)) {
  const namespace = getNamespaceFromTypeName(key);
  const enumName = value.typeName.split(".").pop();

  if (!namespaces[namespace]) {
    namespaces[namespace] = [];
  }

  let enumDefinition = `enum ${enumName} {`;

  for (const enumValue of value.values) {
    enumDefinition += `  ${enumValue.name} = ${enumValue.no};`;
  }

  enumDefinition += "}";

  namespaces[namespace].push(enumDefinition);
}

const allNamespaces = new Set([
  ...Object.keys(namespaces),
  ...Object.keys(services)
]);

for (const namespace of allNamespaces) {
  let imports = "";

  if (namespaceImports[namespace]) {
    for (const importNamespace of namespaceImports[namespace]) {
      imports += `import "${importNamespace}.proto";\n`;
    }
  }

  let namespaceContent = `syntax = "proto3";\n${imports}\n`;
  namespaceContent += 'import "google/protobuf/timestamp.proto";\n';
  namespaceContent += 'import "google/protobuf/duration.proto";\n';
  namespaceContent += 'import "google/protobuf/empty.proto";\n';
  namespaceContent += "\n";
  namespaceContent += `package ${namespace};\n`;

  if (namespaces[namespace]) {
    for (const message of namespaces[namespace]) {
      namespaceContent += message + "\n";
    }
  }

  if (services[namespace]) {
    for (const service of services[namespace]) {
      namespaceContent += service + "\n";
    }
  }

  fs.writeFileSync(path.join(buildDir, `${namespace}.proto`), namespaceContent);
}

const repoDir = path.join(__dirname, "..");
const canonicalProtosDir = path.join(repoDir, "protos");

appendVersionMetadata(path.join(buildDir, WINDSURF_VERSION_PATH), [
  `BUILD_INPUT=${path.relative(repoDir, inputPath)}`, // relative to repo root
  `BUILD_OUTPUT=${path.relative(repoDir, buildDir)}`, // relative to repo root
]);
normalizeVersionFile(path.join(buildDir, WINDSURF_VERSION_PATH));

syncGeneratedToCanonical(buildDir, canonicalProtosDir);

const messagesCount = seenTypes.size;
const enumsCount = Object.keys(enums).length;
const servicesCount = Object.values(services).reduce(
  (acc, defs) => acc + (Array.isArray(defs) ? defs.length : 0),
  0
);

console.log(
  JSON.stringify(
    {
      version: windsurfVersion,
      inputPath,
      outputPath: buildDir,
      messages: messagesCount,
      enums: enumsCount,
      services: servicesCount,
    },
    null,
    2
  )
);
