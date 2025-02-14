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

  constructor(modelId: string, config?: LanguageModelConfig) {
    super(modelId, config);
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || config?.apiKey,
    });
  }

  async createBatch(
    requests: BatchRequest<string>[],
    outputSchema: z.ZodSchema<any>
  ): Promise<string> {
    try {
      // Convert Zod schema to a JSON schema that matches Anthropic's types
      const zodToJsonSchema = (schema: z.ZodSchema<any>) => {
        if (schema instanceof z.ZodObject) {
          const shape = schema.shape;
          return {
            type: 'object' as const,
            properties: Object.fromEntries(
              Object.entries(shape).map(([key, value]) => [
                key,
                {
                  type:
                    value instanceof z.ZodString
                      ? ('string' as const)
                      : ('any' as const),
                },
              ])
            ),
            required: Object.keys(shape),
          };
        }
        return { type: 'object' as const, properties: {} };
      };

      const batch = await this.client.messages.batches.create({
        requests: requests.map((request) => ({
          custom_id: request.customId,
          params: {
            model: this.modelId,
            max_tokens: 2048,
            messages: [
              {
                role: 'user',
                content: request.input,
              },
            ],
            tools: [
              {
                name: 'format_response',
                description:
                  'Format the response according to the required schema',
                input_schema: zodToJsonSchema(outputSchema),
              },
            ],
            tool_choice: {
              type: 'tool',
              name: 'format_response',
              disable_parallel_tool_use: true,
            },
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
      const results = await this.client.messages.batches.results(batchId);

      return results.map((result) => {
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
