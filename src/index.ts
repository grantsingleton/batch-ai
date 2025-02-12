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
  config: LanguageModelConfig
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
  config: LanguageModelConfig
): LanguageModel {
  return new AnthropicLanguageModel(modelId, config);
}

/**
 * Creates a batch of requests to be processed by a language model
 * @param model The language model to use
 * @param prompts Array of prompts to process
 * @param outputSchema Zod schema for validating and typing the output
 * @returns Promise resolving to the batch ID
 */
export async function createObjectBatch<T>(
  model: LanguageModel,
  prompts: string[],
  outputSchema: z.ZodSchema<T>
): Promise<string> {
  const requests: BatchRequest<string>[] = prompts.map((prompt, index) => ({
    customId: `request-${index}`,
    input: prompt,
  }));

  return model.createBatch(requests, outputSchema);
}

/**
 * Gets the status and results of a batch
 * @param model The language model that created the batch
 * @param batchId The ID of the batch to retrieve
 * @returns Promise resolving to the batch status and results
 */
export async function getObjectBatch(
  model: LanguageModel,
  batchId: string
): Promise<{
  batch: Batch;
  results?: BatchResponse<unknown>[];
}> {
  const batch = await model.getBatch(batchId);

  if (batch.status === 'completed') {
    const results = await model.getBatchResults(batchId);
    return { batch, results };
  }

  return { batch };
}
