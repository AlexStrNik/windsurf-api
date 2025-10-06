const protos = require("./chat.js");
const fs = require("fs");

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

  fs.writeFileSync(`protos/${namespace}.proto`, namespaceContent);
}
