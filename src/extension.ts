import * as vscode from "vscode";
import { ChatParams } from "./types";
import { Client } from "./client";
import { HttpServer } from "./http_server";

let client: Client | null = null;
let httpServer: HttpServer | null = null;

export function activate(context: vscode.ExtensionContext) {
  const windsurfHandler = vscode.commands.registerCommand(
    "windsurf.initializeCascade",
    async (...args) => {
      const params = JSON.parse(atob(args[0]));
      client = new Client(params);
      console.log("Windsurf initialized");

      const config = vscode.workspace.getConfiguration("windsurfapi");
      const autoStart = config.get<boolean>("autoStart", false);

      if (autoStart && !httpServer?.isRunning()) {
        const port = config.get<number>("port", 47923);
        httpServer = new HttpServer(client, port);
        try {
          await httpServer.start();
          console.log(`Server auto-started on port ${port}`);
        } catch (error) {
          console.error("Failed to auto-start server:", error);
        }
      }

      windsurfHandler.dispose();
      setTimeout(() => {
        vscode.commands.executeCommand("windsurf.initializeCascade", ...args);
      });
    }
  );

  const startServerCommand = vscode.commands.registerCommand(
    "windsurfapi.startServer",
    async () => {
      if (!client) {
        vscode.window.showErrorMessage("Not initialized");
        return;
      }

      if (httpServer?.isRunning()) {
        vscode.window.showWarningMessage("Server already running");
        return;
      }

      try {
        const config = vscode.workspace.getConfiguration("windsurfapi");
        const port = config.get<number>("port", 47923);

        httpServer = new HttpServer(client, port);
        await httpServer.start();

        vscode.window.showInformationMessage(`Server started on port ${port}`);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  const stopServerCommand = vscode.commands.registerCommand(
    "windsurfapi.stopServer",
    async () => {
      if (!httpServer?.isRunning()) {
        vscode.window.showWarningMessage("Server not running");
        return;
      }

      try {
        await httpServer.stop();
        vscode.window.showInformationMessage("Server stopped");
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  context.subscriptions.push(
    windsurfHandler,
    startServerCommand,
    stopServerCommand
  );
}

export function deactivate() {
  if (httpServer?.isRunning()) {
    httpServer.stop();
  }
}
