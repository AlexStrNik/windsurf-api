import Fastify, { FastifyInstance } from "fastify";
import { Client } from "./client";

interface PromptRequest {
  text: string;
  images?: Array<{ base64: string; mime?: string }>;
  model?: string;
  cascadeId?: string | null;
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

    this.server.get("/models", async (request, reply) => {
      try {
        const models = await this.client.getModels();
        const modelMap = models.reduce((acc, model) => {
          if (model.modelOrAlias) {
            acc[model.label] = {
              model: model.modelOrAlias.model,
              alias: model.modelOrAlias.alias,
            };
          }
          return acc;
        }, {} as Record<string, { model: number; alias: number }>);
        return modelMap;
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.server.get("/trajectories", async (request, reply) => {
      try {
        const trajectories = await this.client.getTrajectories();
        const mapped = Object.entries(trajectories).map(([cascadeId, summary]) => ({
          cascadeId,
          name: summary.renamedTitle || summary.summary,
          summary: summary.summary,
          stepCount: summary.stepCount,
          status: summary.status,
          errored: summary.errored,
          createdTime: summary.createdTime
            ? new Date(
                Number(summary.createdTime.seconds) * 1000 +
                  summary.createdTime.nanos / 1000000
              ).toISOString()
            : undefined,
          lastModifiedTime: summary.lastModifiedTime
            ? new Date(
                Number(summary.lastModifiedTime.seconds) * 1000 +
                  summary.lastModifiedTime.nanos / 1000000
              ).toISOString()
            : undefined,
          isClaudeCode: summary.isClaudeCode,
        }));
        return mapped;
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.server.post<{ Body: PromptRequest }>("/prompt", async (request, reply) => {
      const { text, images, model, cascadeId } = request.body;

      if (!text) {
        return reply.status(400).send({ error: "text is required" });
      }

      try {
        const usedCascadeId = await this.client.sendMessage(text, images, model, cascadeId);
        return { success: true, cascadeId: usedCascadeId };
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
