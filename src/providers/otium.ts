import { LanguageModelConfig } from "../types.js";
import { OpenAICompatibleLanguageModel } from "./openai-compatible.js";

export const OTIUM_BASE_URL = "https://api.getotium.ai/v1";

/**
 * How long Otium may take. A longer window costs less: Otium waits for cheaper
 * compute within it. "24h" is the Standard tier, "7d" the Remnant tier.
 */
export type OtiumCompletionWindow = "24h" | "7d";

export interface OtiumConfig extends LanguageModelConfig {
  /** Defaults to "24h". */
  completionWindow?: OtiumCompletionWindow;
  /** Defaults to Otium's API host. */
  baseURL?: string;
}

/**
 * Otium (https://getotium.ai) runs batch work only, through OpenAI's Files and
 * Batch APIs, so it shares the OpenAI provider's batch flow.
 */
export class OtiumLanguageModel extends OpenAICompatibleLanguageModel {
  public readonly provider = "otium" as const;

  constructor(modelId: string, config?: OtiumConfig) {
    super(modelId, config, {
      apiKey: process.env.OTIUM_API_KEY || config?.apiKey,
      baseURL: config?.baseURL ?? OTIUM_BASE_URL,
      completionWindow: config?.completionWindow ?? "24h",
    });
  }
}
