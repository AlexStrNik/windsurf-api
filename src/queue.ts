import { Client } from "./client";
import { randomUUID } from "crypto";
import { CascadeRunStatus } from "./gen/exa.cortex_pb_pb";

export type MessageStatus = "sent" | "queued" | "error";

export interface QueuedMessage {
  id: string;
  cascadeId: string;
  text: string;
  images?: Array<{ base64: string; mime?: string }>;
  model?: string;
  status: MessageStatus;
  timestamp: Date;
  error?: string;
}

export class MessageQueue {
  private queues: Map<string, QueuedMessage[]> = new Map();
  private processing: Set<string> = new Set();
  private workerInterval: NodeJS.Timeout | null = null;

  constructor(private client: Client, private pollIntervalMs: number = 1000) {}

  async trySendOrQueue(
    cascadeId: string,
    text: string,
    images?: Array<{ base64: string; mime?: string }>,
    model?: string
  ): Promise<{ status: MessageStatus; messageId: string }> {
    const message: QueuedMessage = {
      id: randomUUID(),
      cascadeId,
      text,
      images,
      model,
      status: "queued",
      timestamp: new Date(),
    };

    try {
      const status = await this.client.getCascadeStatus(cascadeId);

      if (status === CascadeRunStatus.IDLE) {
        await this.client.sendMessageDirect(text, cascadeId, images, model);
        message.status = "sent";
        console.log(`Message ${message.id} sent immediately to cascade ${cascadeId}`);
        return { status: "sent", messageId: message.id };
      }
    } catch (error) {
      console.log(`Could not check cascade status, will queue: ${error}`);
    }

    if (!this.queues.has(cascadeId)) {
      this.queues.set(cascadeId, []);
    }
    this.queues.get(cascadeId)!.push(message);
    console.log(`Message ${message.id} queued for cascade ${cascadeId}`);

    return { status: "queued", messageId: message.id };
  }

  getQueue(cascadeId?: string): QueuedMessage[] {
    if (cascadeId) {
      return this.queues.get(cascadeId) || [];
    }

    const allMessages: QueuedMessage[] = [];
    for (const queue of this.queues.values()) {
      allMessages.push(...queue);
    }
    return allMessages;
  }

  getMessage(messageId: string): QueuedMessage | undefined {
    for (const queue of this.queues.values()) {
      const message = queue.find((m) => m.id === messageId);
      if (message) return message;
    }
    return undefined;
  }

  getQueuePosition(messageId: string, cascadeId: string): number {
    const queue = this.queues.get(cascadeId);
    if (!queue) return -1;

    const index = queue.findIndex((m) => m.id === messageId);
    return index === -1 ? -1 : index + 1;
  }

  startWorker(): void {
    if (this.workerInterval) {
      console.log("Worker already running");
      return;
    }

    console.log("Starting queue worker");
    this.workerInterval = setInterval(() => {
      this.processQueues().catch((error) => {
        console.error("Queue processing error:", error);
      });
    }, this.pollIntervalMs);
  }

  stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log("Queue worker stopped");
    }
  }

  private async processQueues(): Promise<void> {
    for (const [cascadeId, queue] of this.queues.entries()) {
      if (this.processing.has(cascadeId) || queue.length === 0) {
        continue;
      }

      this.processing.add(cascadeId);

      try {
        const message = queue[0];

        try {
          const status = await this.client.getCascadeStatus(cascadeId);

          if (status === CascadeRunStatus.IDLE) {
            await this.client.sendMessageDirect(
              message.text,
              cascadeId,
              message.images,
              message.model
            );
            message.status = "sent";
            console.log(`Message ${message.id} sent to cascade ${cascadeId}`);
            queue.shift();

            if (queue.length === 0) {
              this.queues.delete(cascadeId);
            }
          }
        } catch (error) {
          message.status = "error";
          message.error = error instanceof Error ? error.message : String(error);
          console.error(`Message ${message.id} failed:`, message.error);
          queue.shift();

          if (queue.length === 0) {
            this.queues.delete(cascadeId);
          }
        }
      } finally {
        this.processing.delete(cascadeId);
      }
    }
  }

  clear(): void {
    this.queues.clear();
    console.log("Queue cleared");
  }
}
