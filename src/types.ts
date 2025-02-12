import { z } from 'zod';

// Common types across providers
export type BatchStatus =
  | 'validating'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelling'
  | 'cancelled';

export interface BatchRequestCounts {
  total: number;
  completed: number;
  failed: number;
  processing?: number;
  cancelled?: number;
  expired?: number;
}

export interface BatchMetadata {
  [key: string]: string;
}

// Base interfaces for batch operations
export interface BatchRequest<T> {
  customId: string;
  input: T;
}

export interface BatchResponse<T> {
  customId: string;
  output?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface Batch {
  id: string;
  status: BatchStatus;
  requestCounts: BatchRequestCounts;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  metadata?: BatchMetadata;
}

// Provider-specific interfaces
export interface LanguageModelConfig {
  apiKey: string;
  organization?: string;
  baseUrl?: string;
}

export interface LanguageModel {
  provider: 'openai' | 'anthropic';
  modelId: string;
  config: LanguageModelConfig;

  // Core methods that each provider must implement
  createBatch<T>(
    requests: BatchRequest<T>[],
    outputSchema: z.ZodSchema<any>
  ): Promise<string>;
  getBatch(batchId: string): Promise<Batch>;
  getBatchResults<T>(batchId: string): Promise<BatchResponse<T>[]>;
  cancelBatch?(batchId: string): Promise<void>;
}

// Error types
export class BatchError extends Error {
  constructor(message: string, public code: string, public batchId?: string) {
    super(message);
    this.name = 'BatchError';
  }
}
