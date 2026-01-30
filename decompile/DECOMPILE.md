# Decompiling Windsurf protos

Working as of 2026-01-30 (Windsurf 1.13.14 / Extension 1.48.2)

## New workflow (current builds: `workbench.desktop.main.js`)

1. Get `workbench.desktop.main.js` from your installed Windsurf build.
2. Place it in this folder as `workbench.desktop.main.js`.
3. Run `strip_bundle.js` to extract just the proto/service definitions:

    `pnpm exec node decompile/strip_bundle.js`

    This generates `workbench.desktop.main.protos.js`.
4. Run `decompile_protos.js`:

    `pnpm exec node decompile/decompile_protos.js`

    It should produce protos in the `protos/` folder.

## Legacy workflow (older builds: `chat.js`)

1. Get `chat.js` using VSCode dev tools from the Windsurf cascade panel.
2. Place it in this folder as `chat.js`.
3. Format it.
4. Run `decompile_protos.js`.
5. It will fail with something like `document is not defined on line <LINE>`.
6. Go to `chat.js` and remove everything starting from that line.
7. Run `find_services.js` (it prints something like `module.exports = { ... }`).
8. Copy the output and place it at the end of `chat.js`.
9. Run `decompile_protos.js` again. It should produce protos in the `protos/` folder.

No need to do it every time; protos are committed to the repo. Use this if something stopped working.
