import {
  LanguageModel,
  LanguageModelConfig,
  BatchRequest,
  BatchResponse,
  Batch,
  BatchError,
  ContentPart,
} from "./types";
import { OpenAILanguageModel } from "./providers/openai";
import { AnthropicLanguageModel } from "./providers/anthropic";
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
 * @param modelId The OpenAI model ID (e.g. 'gpt-4', 'gpt-3.5-turbo')
 * @param config Configuration options including API key
 */
export function openai(
  modelId: OpenAIModel,
  config?: LanguageModelConfig
): LanguageModel<Array<ContentPart>> {
  return new OpenAILanguageModel(modelId, config);
}

/**
 * Creates an Anthropic language model instance
 * @param modelId The Anthropic model ID (e.g. 'claude-3-opus-20240229')
 * @param config Configuration options including API key
 */
export function anthropic(
  modelId: AnthropicModel,
  config?: LanguageModelConfig
): LanguageModel<Array<ContentPart>> {
  return new AnthropicLanguageModel(modelId, config);
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
