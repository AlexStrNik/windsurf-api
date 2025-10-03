# Disclaimer

I am not affiliated with Codeium or Windsurf. I am not responsible for any damage or loss of data that may occur from using this extension. It may stop working at any time, as it's based on decompiled protos and guessed logic. If you are a Windsurf developer, I dare you: please consider adding an API to your wonderful IDE. That would benefit a lot of your users - just imagine being able to send prompts with context directly from Figma or Chrome DevTools without needing to copy-paste large texts.

# How it works

## Problem 1: Getting the server port and credentials

Windsurf uses a random port for its gRPC server. The port is managed by (I think) a modified part of the VSCode core. But the chat panel is actually a built-in extension, so how the fuck does it know where to connect?

Simple: after server initialization and user account retrieval, Windsurf executes a command (`windsurf.initializeCascade`) with parameters including the port and nonce.

The command execution mechanism is the only public API of any extension. Every extension in VSCode has two isolated parts: host process and renderer. Like in Electron, but we don't actually have control over the renderer process - we can only ask VSCode to spawn an iframe for us. The problem is that iframes are also isolated, and you cannot just go to some other iframe and execute scripts in its context.

**The solution:** VSCode docs won't tell you this, but you can override handlers for any other extension. The only thing that matters is the order of loading, and thanks god Windsurf extension loads first.

```typescript
const windsurfHandler = vscode.commands.registerCommand(
  "windsurf.initializeCascade",
  async (...args) => {
    const params = JSON.parse(atob(args[0]));
    console.log(params);
  }
);
```

This simple trick gives you the port, server API key, and metadata. But it breaks Windsurf's extension. So how do we call the original handler?

There's no direct way to get a callback for a registered command, but if we dispose our handler and re-execute the command, it gets passed to the original handler. For some reason VSCode doesn't replace it completely - it just pushes our handler to the top of the stack.

```typescript
const windsurfHandler = vscode.commands.registerCommand(
  "windsurf.initializeCascade",
  async (...args) => {
    const params = JSON.parse(atob(args[0]));

    client = new Client(params);
    console.log("Windsurf initialized");

    windsurfHandler.dispose();
    setTimeout(() => {
      vscode.commands.executeCommand("windsurf.initializeCascade", ...args);
    });
  }
);
```

This allows both our extension and Windsurf to work.

## Problem 2: Decompiling the gRPC protos

Windsurf uses gRPC for communication with its server, and it's not a public API. We need to get the protos. Thankfully JS is fucking stupid and straightforward - having a compiled gRPC client, we can do some magic (described in [./decompile/DECOMPILE.md](./decompile/DECOMPILE.md)) and get the source protos back, just to compile them back to TypeScript. Fucking cycle of nonsense.

## Problem 3: Understanding the protocol

With ports and protos, we can finally send messages to the server. Go to the network tab, observe what chat.js sends, decode protobufs to get an idea of what to send and where. Write a client and that's it.

Wrap that shit in a REST server, and now we can start a new cascade and send messages from any app. The only thing the user needs to do is manually open a newly created chat. I didn't implement continuing an existing chat (though I found how - look at `GetAllCascadeTrajectoriesRequest` if you need this).

Also, there's a model selector that uses numbers as model IDs. No idea how to map them to readable names, so I hardcoded whatever I had selected while reversing this. You can easily change it - just use `./scripts/decode_request.js` to decode the body of `SendUserCascadeMessage` captured by sending any message to any chat.

# Usage

1. Install the extension in Windsurf
2. Configure settings:
   - `windsurfapi.port` - HTTP server port (default: 47923)
   - `windsurfapi.autoStart` - Auto-start server on Windsurf init (default: false)
3. Start server manually via command palette: `Windsurf API: Start Server` (or enable autoStart)
4. Send requests to `http://localhost:47923/prompt`:

```bash
curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from API"}'
```

With images:

```bash
curl -X POST http://localhost:47923/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What is in this image?",
    "images": [{"base64": "iVBORw0KGgo...", "mime": "image/png"}]
  }'
```

# Commands

- `Windsurf API: Start Server` - Start HTTP server
- `Windsurf API: Stop Server` - Stop HTTP server
