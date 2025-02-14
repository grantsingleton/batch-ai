import { z } from 'zod';
import {
  LanguageModel,
  LanguageModelConfig,
  BatchRequest,
  BatchResponse,
  Batch,
  BatchError,
} from './types';
import { OpenAILanguageModel } from './providers/openai';
import { AnthropicLanguageModel } from './providers/anthropic';

// Re-export types
export {
  LanguageModel,
  LanguageModelConfig,
  BatchRequest,
  BatchResponse,
  Batch,
  BatchError,
};

/**
 * Creates an OpenAI language model instance
 * @param modelId The OpenAI model ID (e.g. 'gpt-4', 'gpt-3.5-turbo')
 * @param config Configuration options including API key
 */
export function openai(
  modelId: string,
  config?: LanguageModelConfig
): LanguageModel {
  return new OpenAILanguageModel(modelId, config);
}

/**
 * Creates an Anthropic language model instance
 * @param modelId The Anthropic model ID (e.g. 'claude-3-opus-20240229')
 * @param config Configuration options including API key
 */
export function anthropic(
  modelId: string,
  config?: LanguageModelConfig
): LanguageModel {
  return new AnthropicLanguageModel(modelId, config);
}

export interface CreateObjectBatchParams {
  model: LanguageModel;
  requests: BatchRequest<string>[];
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
export async function createObjectBatch({
  model,
  requests,
  outputSchema,
}: CreateObjectBatchParams): Promise<CreateObjectBatchResponse> {
  const batchId = await model.createBatch(requests, outputSchema);
  return { batchId };
}

export interface GetObjectBatchParams {
  model: LanguageModel;
  batchId: string;
}

/**
 * Gets the status and results of a batch
 * @param params Object containing the model and batch ID
 * @returns Promise resolving to the batch status and results
 */
export async function getObjectBatch<TOutput>({
  model,
  batchId,
}: GetObjectBatchParams): Promise<{
  batch: Batch;
  results?: BatchResponse<TOutput>[];
}> {
  const batch = await model.getBatch(batchId);

  if (batch.status === 'completed') {
    const results = await model.getBatchResults<TOutput>(batchId);
    return { batch, results };
  }

  return { batch };
}
