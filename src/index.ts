export interface BatchAIConfig {
  provider: string;
  apiKey: string;
  maxConcurrency?: number;
  retryAttempts?: number;
}

export interface BatchRequest {
  input: string;
  options?: Record<string, any>;
}

export interface BatchResponse {
  output: string;
  metadata?: Record<string, any>;
}

export class BatchAI {
  private config: BatchAIConfig;

  constructor(config: BatchAIConfig) {
    this.config = {
      maxConcurrency: 5,
      retryAttempts: 3,
      ...config,
    };
  }

  // Main method to process batch requests
  async processBatch(requests: BatchRequest[]): Promise<BatchResponse[]> {
    // Implementation coming soon
    throw new Error('Method not implemented');
  }
}

// Export additional types and interfaces
export * from './types';
