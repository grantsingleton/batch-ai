import { OpenAI } from 'openai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  BatchError,
  BatchRequest,
  BatchResponse,
  Batch,
  LanguageModel,
  LanguageModelConfig,
  BatchStatus,
} from '../types';
import { zodResponseFormat } from 'openai/helpers/zod';

export class OpenAILanguageModel extends LanguageModel {
  public readonly provider = 'openai' as const;
  private client: OpenAI;

  constructor(modelId: string, config?: LanguageModelConfig) {
    super(modelId, config);
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || config?.apiKey,
    });
  }

  private async createJsonlFile(
    requests: BatchRequest<string>[],
    outputSchema: z.ZodSchema<any>
  ): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `batch-${Date.now()}.jsonl`);

    const jsonlContent = requests
      .map((request) =>
        JSON.stringify({
          custom_id: request.customId,
          method: 'POST',
          url: '/v1/chat/completions',
          body: {
            model: this.modelId,
            messages: [
              {
                role: 'user',
                content: request.input,
              },
            ],
            response_format: zodResponseFormat(outputSchema, 'moderation'),
          },
        })
      )
      .join('\n');

    await fs.promises.writeFile(tempFile, jsonlContent);
    return tempFile;
  }

  async createBatch(
    requests: BatchRequest<string>[],
    outputSchema: z.ZodSchema<unknown>
  ): Promise<string> {
    try {
      // Create JSONL file
      const jsonlFile = await this.createJsonlFile(requests, outputSchema);

      // Upload file
      const file = await this.client.files.create({
        file: fs.createReadStream(jsonlFile),
        purpose: 'batch',
      });

      // Create batch
      const batch = await this.client.batches.create({
        input_file_id: file.id,
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
      });

      // Cleanup temp file
      await fs.promises.unlink(jsonlFile);

      return batch.id;
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : 'Unknown error',
        'batch_creation_failed'
      );
    }
  }

  async getBatch(batchId: string): Promise<Batch> {
    try {
      const batch = await this.client.batches.retrieve(batchId);

      return {
        id: batch.id,
        status: this.mapStatus(batch.status),
        requestCounts: {
          total: batch.request_counts?.total ?? 0,
          completed: batch.request_counts?.completed ?? 0,
          failed: batch.request_counts?.failed ?? 0,
        },
        createdAt: new Date(batch.created_at * 1000),
        completedAt: batch.completed_at
          ? new Date(batch.completed_at * 1000)
          : undefined,
        expiresAt: batch.expires_at
          ? new Date(batch.expires_at * 1000)
          : undefined,
      };
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : 'Unknown error',
        'batch_retrieval_failed',
        batchId
      );
    }
  }

  async getBatchResults<TOutput = unknown>(
    batchId: string
  ): Promise<BatchResponse<TOutput>[]> {
    try {
      const batch = await this.client.batches.retrieve(batchId);

      if (!batch.output_file_id) {
        throw new BatchError(
          'Batch results not yet available',
          'results_not_ready',
          batchId
        );
      }

      const fileContent = await this.client.files.content(batch.output_file_id);
      const results = await fileContent.text();

      return results
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const result = JSON.parse(line);
          return {
            customId: result.custom_id,
            output: JSON.parse(
              result.response?.body?.choices?.[0]?.message?.content
            ) as TOutput,
            usage: result.response?.body?.usage
              ? {
                  promptTokens: result.response.body.usage.prompt_tokens,
                  completionTokens:
                    result.response.body.usage.completion_tokens,
                  totalTokens: result.response.body.usage.total_tokens,
                }
              : undefined,
            error: result.error
              ? {
                  code: result.error.code || 'unknown_error',
                  message: result.error.message || 'Unknown error occurred',
                }
              : undefined,
          };
        });
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : 'Unknown error',
        'results_retrieval_failed',
        batchId
      );
    }
  }

  async cancelBatch(batchId: string): Promise<void> {
    try {
      await this.client.batches.cancel(batchId);
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : 'Unknown error',
        'batch_cancellation_failed',
        batchId
      );
    }
  }

  private mapStatus(status: string): BatchStatus {
    switch (status) {
      case 'validating':
        return 'validating';
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'expired':
        return 'expired';
      case 'cancelling':
        return 'cancelling';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'failed';
    }
  }
}
