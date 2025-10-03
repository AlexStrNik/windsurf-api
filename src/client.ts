import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import {
  SendUserCascadeMessageRequestSchema,
  StartCascadeRequestSchema,
  StartCascadeResponseSchema,
} from "./gen/exa.language_server_pb_pb";
import {
  TextOrScopeItemSchema,
  ImageDataSchema,
  MetadataSchema,
  ModelOrAliasSchema,
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

  constructor(private chatParams: ChatParams) {}

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
    images?: Array<{ base64: string; mime?: string }>
  ): Promise<void> {
    if (!this.cascadeId) {
      this.cascadeId = await this.startCascade();
      console.log("Cascade started:", this.cascadeId);
    }

    const metadata = this.createMetadata();

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
        requestedModel: create(ModelOrAliasSchema, {
          alias: 5,
        }),
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

    const request = create(SendUserCascadeMessageRequestSchema, {
      cascadeId: this.cascadeId!,
      items,
      images: imageData,
      metadata,
      cascadeConfig,
      recipeIds: [],
      blocking: false,
      additionalSteps: [],
    });

    const serialized = toBinary(SendUserCascadeMessageRequestSchema, request);
    const url = `${this.chatParams.languageServerUrl}exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "en-US",
        "connect-protocol-version": "1",
        "content-type": "application/proto",
        "x-codeium-csrf-token": this.chatParams.csrfToken,
      },
      body: serialized,
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    console.log("Message sent successfully");
  }

  private async startCascade(): Promise<string> {
    const metadata = this.createMetadata();

    const request = create(StartCascadeRequestSchema, {
      metadata,
      source: 0,
      trajectoryType: 0,
    });

    const serialized = toBinary(StartCascadeRequestSchema, request);
    const url = `${this.chatParams.languageServerUrl}exa.language_server_pb.LanguageServerService/StartCascade`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "*/*",
        "accept-language": "en-US",
        "connect-protocol-version": "1",
        "content-type": "application/proto",
        "x-codeium-csrf-token": this.chatParams.csrfToken,
      },
      body: serialized,
    });

    if (!response.ok) {
      throw new Error(`StartCascade failed: ${response.status}`);
    }

    const data = await response.arrayBuffer();
    const result = fromBinary(StartCascadeResponseSchema, new Uint8Array(data));

    return result.cascadeId;
  }
}
