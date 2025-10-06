import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { create } from "@bufbuild/protobuf";
import { LanguageServerService } from "./gen/exa.language_server_pb_pb";
import {
  TextOrScopeItemSchema,
  ImageDataSchema,
  MetadataSchema,
  ModelOrAliasSchema,
  ClientModelConfig,
} from "./gen/exa.codeium_common_pb_pb";
import {
  CascadeConfigSchema,
  CascadePlannerConfigSchema,
  CascadeConversationalPlannerConfigSchema,
  CascadeToolConfigSchema,
  RunCommandToolConfigSchema,
  AutoCommandConfigSchema,
  BrainConfigSchema,
  BrainUpdateStrategySchema,
  DynamicBrainUpdateConfigSchema,
  CascadeTrajectorySummary,
  CascadeRunStatus,
} from "./gen/exa.cortex_pb_pb";
import { ChatParams } from "./types";

async function detectMimeType(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const { fileTypeFromBuffer } = await import("file-type");
  const type = await fileTypeFromBuffer(buffer);
  return type?.mime || "application/octet-stream";
}

export class Client {
  private cascadeId: string | null = null;
  private client: ReturnType<typeof createClient<typeof LanguageServerService>>;

  constructor(private chatParams: ChatParams) {
    const transport = createConnectTransport({
      baseUrl: chatParams.languageServerUrl,
      useBinaryFormat: true,
      interceptors: [
        (next) => async (req) => {
          req.header.set("x-codeium-csrf-token", chatParams.csrfToken);
          req.header.set("accept-language", "en-US");
          return await next(req);
        },
      ],
    });

    this.client = createClient(LanguageServerService, transport);
  }

  private createMetadata() {
    return create(MetadataSchema, {
      apiKey: this.chatParams.apiKey,
      ideName: this.chatParams.ideName,
      ideVersion: this.chatParams.ideVersion,
      extensionName: this.chatParams.extensionName,
      extensionVersion: this.chatParams.extensionVersion,
      locale: this.chatParams.locale,
      os: this.chatParams.osName,
      hardware: this.chatParams.architecture,
    });
  }

  async sendMessageDirect(
    text: string,
    cascadeId: string,
    images?: Array<{ base64: string; mime?: string }>,
    modelLabel?: string
  ): Promise<void> {
    const metadata = this.createMetadata();

    let requestedModel = create(ModelOrAliasSchema, { alias: 5 });

    if (modelLabel) {
      const models = await this.getModels();
      const selectedModel = models.find((m) => m.label === modelLabel);
      if (selectedModel?.modelOrAlias) {
        requestedModel = selectedModel.modelOrAlias;
      }
    }

    const cascadeConfig = create(CascadeConfigSchema, {
      plannerConfig: create(CascadePlannerConfigSchema, {
        conversational: create(CascadeConversationalPlannerConfigSchema, {
          plannerMode: 1,
        }),
        toolConfig: create(CascadeToolConfigSchema, {
          runCommand: create(RunCommandToolConfigSchema, {
            autoCommandConfig: create(AutoCommandConfigSchema, {
              autoExecutionPolicy: 3,
            }),
          }),
        }),
        requestedModel,
      }),
      brainConfig: create(BrainConfigSchema, {
        enabled: true,
        updateStrategy: create(BrainUpdateStrategySchema, {
          dynamicUpdate: create(DynamicBrainUpdateConfigSchema, {}),
        }),
      }),
    });

    const items = [create(TextOrScopeItemSchema, { text })];

    const imageData = images
      ? await Promise.all(
          images.map(async (img) =>
            create(ImageDataSchema, {
              base64Data: img.base64,
              mimeType: img.mime || (await detectMimeType(img.base64)),
              caption: "",
            })
          )
        )
      : [];

    await this.client.sendUserCascadeMessage({
      cascadeId,
      items,
      images: imageData,
      metadata,
      cascadeConfig,
      recipeIds: [],
      blocking: false,
      additionalSteps: [],
    });

    console.log("Message sent successfully to cascade", cascadeId);
  }

  async startCascade(): Promise<string> {
    const metadata = this.createMetadata();

    const response = await this.client.startCascade({
      metadata,
      source: 0,
      trajectoryType: 0,
    });

    return response.cascadeId;
  }

  async getCascadeStatus(cascadeId: string): Promise<CascadeRunStatus> {
    const response = await this.client.getCascadeTrajectory({
      cascadeId,
    });

    return response.status;
  }

  async waitForCascadeIdle(
    cascadeId: string,
    maxWaitMs: number = 30000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getCascadeStatus(cascadeId);

      if (status === CascadeRunStatus.IDLE) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Cascade ${cascadeId} did not become idle within ${maxWaitMs}ms`
    );
  }

  async getModels(): Promise<ClientModelConfig[]> {
    const metadata = this.createMetadata();

    const response = await this.client.getCascadeModelConfigs({
      metadata,
    });

    return response.clientModelConfigs;
  }

  async getTrajectories(): Promise<{
    [key: string]: CascadeTrajectorySummary;
  }> {
    const response = await this.client.getAllCascadeTrajectories({
      includeUserInputs: false,
    });

    return response.trajectorySummaries;
  }
}
