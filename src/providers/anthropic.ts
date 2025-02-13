import { Anthropic } from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  BatchError,
  BatchRequest,
  BatchResponse,
  Batch,
  LanguageModel,
  LanguageModelConfig,
  BatchStatus,
} from '../types';

export class AnthropicLanguageModel extends LanguageModel {
  public readonly provider = 'anthropic' as const;
  private client: Anthropic;

  constructor(modelId: string, config: LanguageModelConfig) {
    super(modelId, config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async createBatch(
    requests: BatchRequest<string>[],
    outputSchema: z.ZodSchema<unknown>
  ): Promise<string> {
    try {
      const batch = await this.client.messages.batches.create({
        requests: requests.map((request) => ({
          custom_id: request.customId,
          params: {
            model: this.modelId,
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: request.input,
              },
            ],
          },
        })),
      });

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
      const batch = await this.client.messages.batches.retrieve(batchId);

      return {
        id: batch.id,
        status: this.mapStatus(batch.processing_status),
        requestCounts: {
          total: this.calculateTotal(batch.request_counts),
          completed: batch.request_counts.succeeded,
          failed: batch.request_counts.errored,
          processing: batch.request_counts.processing,
          cancelled: batch.request_counts.canceled,
          expired: batch.request_counts.expired,
        },
        createdAt: new Date(batch.created_at),
        completedAt: batch.ended_at ? new Date(batch.ended_at) : undefined,
        expiresAt: batch.expires_at ? new Date(batch.expires_at) : undefined,
      };
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : 'Unknown error',
        'batch_retrieval_failed',
        batchId
      );
    }
  }

  private calculateTotal(counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  }): number {
    return (
      counts.processing +
      counts.succeeded +
      counts.errored +
      counts.canceled +
      counts.expired
    );
  }

  async getBatchResults<TOutput = unknown>(
    batchId: string
  ): Promise<BatchResponse<TOutput>[]> {
    try {
      const batch = await this.client.messages.batches.retrieve(batchId);

      if (!batch.results_url) {
        throw new BatchError(
          'Batch results not yet available',
          'results_not_ready',
          batchId
        );
      }

      const response = await fetch(batch.results_url);
      const results = await response.text();

      return results
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const result = JSON.parse(line);
          return {
            customId: result.custom_id,
            output:
              result.result.type === 'succeeded'
                ? (result.result.message.content[0].text as TOutput)
                : undefined,
            error:
              result.result.type !== 'succeeded'
                ? {
                    code: result.result.type,
                    message: result.result.error?.message || 'Request failed',
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
      await this.client.messages.batches.cancel(batchId);
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
      case 'in_progress':
        return 'in_progress';
      case 'ended':
        return 'completed';
      case 'canceling':
        return 'cancelling';
      default:
        return 'failed';
    }
  }
}
