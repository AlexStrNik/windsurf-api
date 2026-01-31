const fs = require("fs");
const path = require("path");

const usage = () => {
  console.error("Usage: node decompile/extract_sources.js [--app-dir <Windsurf.app/Contents>]");
};

const parseArgs = (argv) => {
  const args = { appDir: "/Applications/Windsurf.app" };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }

    if (a === "--app-dir") {
      const v = argv[i + 1];
      if (!v) {
        throw new Error("--app-dir requires a value");
      }
      args.appDir = v;
      i++;
      continue;
    }

    throw new Error(`unknown arg: ${a}`);
  }

  return args;
};

const readJsonFile = (p) => {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
};

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

const productJsonPath = path.join("Contents", "Resources", "app", "product.json");
const extensionPackageJsonPath = path.join("Contents", "Resources", "app", "extensions", "windsurf", "package.json");
const workbenchDesktopMainJsPath = path.join("Contents", "Resources", "app", "out", "vs", "workbench", "workbench.desktop.main.js");

const main = () => {
  if (process.platform !== "darwin") {
    throw new Error("extract_sources is currently only supported on macOS");
  }

  const { appDir } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(appDir) || !fs.lstatSync(appDir).isDirectory() || !appDir.endsWith(".app")) {
    throw new Error(`Windsurf.app dir not found: ${appDir}`);
  }

  if (!fs.existsSync(path.join(appDir, productJsonPath))) {
    throw new Error(`product.json not found: ${path.join(appDir, productJsonPath)}`);
  }

  const productForVersion = readJsonFile(path.join(appDir, productJsonPath));
  const windsurfVersion = productForVersion?.windsurfVersion;
  if (typeof windsurfVersion !== "string" || windsurfVersion.length === 0) {
    throw new Error("product.json did not contain a valid windsurfVersion");
  }


  const destDir = path.join(__dirname, "data", `extract_sources-${windsurfVersion}`);
  ensureDirEmpty(destDir);


  const copied = [];

  [productJsonPath,
   extensionPackageJsonPath,
   workbenchDesktopMainJsPath].forEach((f)=>{
    const src = path.join(appDir, f);
    const dst = path.join(destDir, f);
    safeCopyFile(src, dst);
    copied.push(f);
  });

  const productJson = readJsonFile(path.join(destDir, productJsonPath));

  const versionFilePath = path.join(destDir, "WINDSURF_VERSION");
  appendVersionMetadata(versionFilePath, [
    `EXTRACTION_DATE=${new Date().toISOString()}`,
    `WINDSURF_VERSION=${windsurfVersion}`,
    `WINDSURF_COMMIT=${productJson?.commit ?? ""}`,
    `WINDSURF_EXTENSION_VERSION=${productJson?.codeiumVersion ?? ""}`,
    `WINDSURF_EXTENSION_COMMIT=${productJson?.codeiumCommit ?? ""}`,
    `WINDSURF_BUILD_DATE=${productJson?.date ?? ""}`,
    `VSCODE_VERSION=${productJson?.version ?? ""}`,
  ]);

  console.log(
    JSON.stringify(
      {
        windsurfVersion,
        appDir,
        outputDir: destDir,
        copied,
      },
      null,
      2
    )
  );
};

main();
