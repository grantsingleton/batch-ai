import { z } from "zod";
import { Model as AnthropicModel } from "@anthropic-ai/sdk/resources/messages/messages";
import { ChatModel as OpenAIModel } from "openai/resources/chat/chat";

// Common types across providers
export type BatchStatus =
  | "validating"
  | "in_progress"
  | "completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled";

export interface BatchRequestCounts {
  total: number;
  completed: number;
  failed: number;
  processing?: number;
  cancelled?: number;
  expired?: number;
}

// Base interfaces for batch operations
export interface BatchRequest<T> {
  customId: string;
  input: T;
  systemPrompt?: string;
}

export interface BatchResponse<T> {
  customId: string;
  output?: T;
  error?: {
    code: string;
    message: string;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface Batch {
  id: string;
  status: BatchStatus;
  requestCounts: BatchRequestCounts;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

// Provider-specific interfaces
export interface LanguageModelConfig {
  apiKey?: string;
}

export abstract class LanguageModel {
  constructor(
    public readonly modelId: OpenAIModel | AnthropicModel,
    public readonly config?: LanguageModelConfig
  ) {}

  abstract readonly provider: "openai" | "anthropic";

  // Core methods that each provider must implement
  abstract createBatch(
    requests: BatchRequest<string>[],
    outputSchema: z.ZodSchema<unknown>
  ): Promise<string>;

  abstract getBatch(batchId: string): Promise<Batch>;

  abstract getBatchResults<TOutput = unknown>(
    batchId: string
  ): Promise<BatchResponse<TOutput>[]>;

  abstract cancelBatch?(batchId: string): Promise<void>;
}

// Error types
export class BatchError extends Error {
  constructor(message: string, public code: string, public batchId?: string) {
    super(message);
    this.name = "BatchError";
  }
}
