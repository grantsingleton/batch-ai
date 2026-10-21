import { ChatModel } from "openai/resources/chat/chat";
import { LanguageModelConfig } from "../types.js";
import { OpenAICompatibleLanguageModel } from "./openai-compatible.js";

export class OpenAILanguageModel extends OpenAICompatibleLanguageModel {
  public readonly provider = "openai" as const;

  constructor(modelId: ChatModel, config?: LanguageModelConfig) {
    super(modelId, config, {
      apiKey: process.env.OPENAI_API_KEY || config?.apiKey,
      completionWindow: "24h",
    });
  }
}
