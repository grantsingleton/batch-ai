import { Anthropic as BaseAnthropic } from '@anthropic-ai/sdk';

declare module '@anthropic-ai/sdk' {
  interface AnthropicBatchRequestCounts {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  }

  interface AnthropicBatch {
    id: string;
    type: 'message_batch';
    processing_status: 'in_progress' | 'canceling' | 'ended';
    request_counts: AnthropicBatchRequestCounts;
    ended_at: string | null;
    created_at: string;
    expires_at: string;
    archived_at: string | null;
    cancel_initiated_at: string | null;
    results_url: string | null;
  }

  interface AnthropicBatchRequest {
    custom_id: string;
    params: {
      model: string;
      max_tokens: number;
      messages: Array<{
        role: 'user' | 'assistant';
        content: string | Array<{ type: string; text: string }>;
      }>;
    };
  }

  interface AnthropicBatchAPI {
    create(params: {
      requests: AnthropicBatchRequest[];
    }): Promise<AnthropicBatch>;
    retrieve(batchId: string): Promise<AnthropicBatch>;
    cancel(batchId: string): Promise<void>;
  }

  interface AnthropicMessagesAPI extends BaseAnthropic {
    batches: AnthropicBatchAPI;
  }

  interface Anthropic extends BaseAnthropic {
    messages: AnthropicMessagesAPI;
  }
}
