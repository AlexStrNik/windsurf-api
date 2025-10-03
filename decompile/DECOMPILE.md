# Decompiling Windsurf protos

Working as of 2025-10-03

1. Get `chat.js` using VSCode dev tools from the Windsurf cascade panel
2. Place it in this folder as `chat.js`
3. Format it (takes fucking long but necessary)
4. Run `decompile_protos.js`
5. It will fail with something like `document is not defined on line <LINE>`
6. Go to `chat.js` and remove everything starting from that line
7. Run `find_services.js` - it generates something like `module.exports = { random obfuscated names }`
8. Copy the output and place it at the end of `chat.js`
9. Run `decompile_protos.js` again - should work and produce protos in `protos` folder
10. No need to do it every time, i have commited protos to the repo, but if something stopped working you know what to do
