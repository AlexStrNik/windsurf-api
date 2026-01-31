# Decompiling Windsurf protos

Working as of 2026-01-30 (Windsurf 1.13.14 / Extension 1.48.2)

## New workflow (current builds: `workbench.desktop.main.js`)

1. Run `extract_sources.js` to copy the necessary files from your Windsurf build:
```
pnpm run decompile:extract
```

1. Run `prepare_decompile.js` to format the file for decompilation and extract just the proto/service definitions:
```
pnpm run decompile:prepare
```

1. Run `build_protos.js` to generate the `.proto` files:
```
pnpm run decompile:build
```

After a successful run, the `WINDSURF_VERSION` metadata and generated `.proto` files are synced into the repo’s canonical `protos/` directory.

## Legacy workflow (older builds: `chat.js`)

1. Get `chat.js` using VSCode dev tools from the Windsurf cascade panel.
2. Place it in this folder as `chat.js`.
3. Format it.
4. Run `pnpm exec node build_protos.js ./chat.js`.
5. It will fail with something like `document is not defined on line <LINE>`.
6. Go to `chat.js` and remove everything starting from that line.
7. Run `pnpm exec node find_services.js` (it prints something like `module.exports = { ... }`).
8. Copy the output and place it at the end of `chat.js`.
9. Run `pnpm exec node build_protos.js ./chat.js` again. It should produce protos in the `protos/` folder.

No need to do it every time; protos are committed to the repo. Use this if something stopped working.
