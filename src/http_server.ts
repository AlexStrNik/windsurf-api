import Fastify, { FastifyInstance } from "fastify";
import { Client } from "./client";
import { MessageQueue } from "./queue";

interface PromptRequest {
  text: string;
  images?: Array<{ base64: string; mime?: string }>;
  model?: string;
  cascadeId?: string | null;
}

export class HttpServer {
  private server: FastifyInstance | null = null;
  private port: number;
  private queue: MessageQueue;

  constructor(private client: Client, port: number = 47923) {
    this.port = port;
    this.queue = new MessageQueue(client);
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
        return models
          .filter((m) => m.modelOrAlias)
          .map((m) => m.label);
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.server.get<{ Querystring: { cascadeId: string } }>(
      "/status",
      async (request, reply) => {
        const { cascadeId } = request.query;

        if (!cascadeId) {
          return reply.status(400).send({ error: "cascadeId query parameter is required" });
        }

        try {
          const status = await this.client.getCascadeStatus(cascadeId);
          return { cascadeId, status };
        } catch (error) {
          return reply.status(500).send({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

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
        let targetCascadeId = cascadeId;
        if (!targetCascadeId) {
          targetCascadeId = await this.client.startCascade();
          console.log("Created new cascade:", targetCascadeId);
        }

        const result = await this.queue.trySendOrQueue(
          targetCascadeId,
          text,
          images,
          model
        );

        const queuePosition =
          result.status === "queued"
            ? this.queue.getQueuePosition(result.messageId, targetCascadeId)
            : undefined;

        return {
          status: result.status,
          messageId: result.messageId,
          cascadeId: targetCascadeId,
          queuePosition,
        };
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.server.get<{ Querystring: { cascadeId?: string } }>(
      "/queue",
      async (request, reply) => {
        const { cascadeId } = request.query;
        const queue = this.queue.getQueue(cascadeId);

        return {
          queue: queue.map((msg) => ({
            messageId: msg.id,
            cascadeId: msg.cascadeId,
            status: msg.status,
            timestamp: msg.timestamp.toISOString(),
            error: msg.error,
          })),
          length: queue.length,
          cascadeId: cascadeId || null,
        };
      }
    );

    this.server.get<{ Params: { messageId: string } }>(
      "/queue/:messageId",
      async (request, reply) => {
        const { messageId } = request.params;
        const message = this.queue.getMessage(messageId);

        if (!message) {
          return reply.status(404).send({ error: "Message not found" });
        }

        const queuePosition = this.queue.getQueuePosition(
          messageId,
          message.cascadeId
        );

        return {
          messageId: message.id,
          cascadeId: message.cascadeId,
          status: message.status,
          timestamp: message.timestamp.toISOString(),
          queuePosition: queuePosition > 0 ? queuePosition : undefined,
          error: message.error,
        };
      }
    );

    await this.server.listen({ port: this.port, host: "0.0.0.0" });
    console.log(`HTTP server listening on port ${this.port}`);

    this.queue.startWorker();
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.queue.stopWorker();
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
