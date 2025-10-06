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

  async sendMessage(
    text: string,
    images?: Array<{ base64: string; mime?: string }>,
    modelLabel?: string,
    cascadeId?: string | null
  ): Promise<string> {
    let targetCascadeId: string;

    if (cascadeId === null) {
      targetCascadeId = await this.startCascade();
      this.cascadeId = targetCascadeId;
      console.log("Cascade started:", targetCascadeId);
    } else if (cascadeId !== undefined) {
      targetCascadeId = cascadeId;
      this.cascadeId = cascadeId;
    } else {
      if (!this.cascadeId) {
        this.cascadeId = await this.startCascade();
        console.log("Cascade started:", this.cascadeId);
      }
      targetCascadeId = this.cascadeId;
    }

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
      cascadeId: targetCascadeId,
      items,
      images: imageData,
      metadata,
      cascadeConfig,
      recipeIds: [],
      blocking: false,
      additionalSteps: [],
    });

    console.log("Message sent successfully");
    return targetCascadeId;
  }

  private async startCascade(): Promise<string> {
    const metadata = this.createMetadata();

    const response = await this.client.startCascade({
      metadata,
      source: 0,
      trajectoryType: 0,
    });

    return response.cascadeId;
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
