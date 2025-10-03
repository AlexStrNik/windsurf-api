import Fastify, { FastifyInstance } from "fastify";
import { Client } from "./client";

interface PromptRequest {
  text: string;
  images?: Array<{ base64: string; mime?: string }>;
}

export class HttpServer {
  private server: FastifyInstance | null = null;
  private port: number;

  constructor(private client: Client, port: number = 47923) {
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error("Server already running");
    }

    this.server = Fastify({ logger: false });

    this.server.addHook("onRequest", async (request, reply) => {
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type");

      if (request.method === "OPTIONS") {
        reply.status(200).send();
      }
    });

    this.server.get("/health", async (request, reply) => {
      return { status: "ok" };
    });

    this.server.post<{ Body: PromptRequest }>("/prompt", async (request, reply) => {
      const { text, images } = request.body;

      if (!text) {
        return reply.status(400).send({ error: "text is required" });
      }

      try {
        await this.client.sendMessage(text, images);
        return { success: true };
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await this.server.listen({ port: this.port, host: "0.0.0.0" });
    console.log(`HTTP server listening on port ${this.port}`);
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
      console.log("HTTP server stopped");
    }
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}
