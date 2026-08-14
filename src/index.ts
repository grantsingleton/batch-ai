import {
  LanguageModel,
  LanguageModelConfig,
  BatchRequest,
  BatchResponse,
  Batch,
  BatchError,
  ContentPart,
} from "./types.js";
import { OpenAILanguageModel } from "./providers/openai.js";
import { AnthropicLanguageModel } from "./providers/anthropic.js";
import { GeminiLanguageModel } from "./providers/gemini.js";
import { ChatModel as OpenAIModel } from "openai/resources/chat/chat";
import { Model as AnthropicModel } from "@anthropic-ai/sdk/resources/messages/messages";

// Re-export types
export {
  LanguageModel,
  LanguageModelConfig,
  BatchRequest,
  BatchResponse,
  Batch,
  BatchError,
  ContentPart,
};

/**
 * Creates an OpenAI language model instance
 * @param modelId The OpenAI model ID (e.g. 'gpt-5.6', 'gpt-5.6-terra', 'gpt-4.1')
 * @param config Configuration options including API key
 */
export function openai(
  modelId: OpenAIModel | (string & {}),
  config?: LanguageModelConfig
): LanguageModel<Array<ContentPart>> {
  return new OpenAILanguageModel(modelId as OpenAIModel, config);
}

/**
 * Creates an Anthropic language model instance
 * @param modelId The Anthropic model ID (e.g. 'claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5')
 * @param config Configuration options including API key
 */
export function anthropic(
  modelId: AnthropicModel | (string & {}),
  config?: LanguageModelConfig
): LanguageModel<Array<ContentPart>> {
  return new AnthropicLanguageModel(modelId as AnthropicModel, config);
}

/**
 * Creates a Google Gemini language model instance
 * @param modelId The Gemini model ID (e.g. 'gemini-3.6-pro', 'gemini-3.6-flash')
 * @param config Configuration options including API key
 */
export function google(
  modelId: string,
  config?: LanguageModelConfig
): LanguageModel<Array<ContentPart>> {
  return new GeminiLanguageModel(modelId, config);
}

export interface CreateObjectBatchParams<Input> {
  model: LanguageModel<Input>;
  requests: BatchRequest<Input>[];
  outputSchema: any;
}

export interface CreateObjectBatchResponse {
  batchId: string;
}

/**
 * Creates a batch of requests to be processed by a language model
 * @param params Object containing the model, prompts, and output schema
 * @returns Promise resolving to the batch ID
 */
export async function createObjectBatch<Input>({
  model,
  requests,
  outputSchema,
}: CreateObjectBatchParams<Input>): Promise<CreateObjectBatchResponse> {
  const batchId = await model.createBatch(requests, outputSchema);
  return { batchId };
}

export interface GetObjectBatchParams<Input> {
  model: LanguageModel<Input>;
  batchId: string;
}

/**
 * Gets the status and results of a batch
 * @param params Object containing the model and batch ID
 * @returns Promise resolving to the batch status and results
 */
export async function getObjectBatch<TInput, TOutput>({
  model,
  batchId,
}: GetObjectBatchParams<TInput>): Promise<{
  batch: Batch;
  results?: BatchResponse<TOutput>[];
}> {
  const batch = await model.getBatch(batchId);

  if (batch.status === "completed") {
    const results = await model.getBatchResults<TOutput>(batchId);
    return { batch, results };
  }

  return { batch };
}
