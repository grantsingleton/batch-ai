# Batch AI

A unified TypeScript SDK for making batch AI requests across different model providers. Currently supports OpenAI and Anthropic batch APIs.

## Features

- Unified interface for multiple AI providers
- Type-safe responses with Zod schema validation
- Simple API for creating and monitoring batches
- Support for OpenAI and Anthropic batch APIs
- Written in TypeScript with full type definitions

## Installation

```bash
npm install batch-ai
```

## Usage

### Basic Example

```typescript
import { z } from 'zod';
import { openai, anthropic, createObjectBatch, getObjectBatch } from 'batch-ai';

// Define your output schema
const responseSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number(),
});

// Initialize a model (OpenAI or Anthropic)
const model = openai('gpt-4', {
  apiKey: process.env.OPENAI_API_KEY!,
});

// Or use Anthropic
const model = anthropic('claude-3-opus-20240229', {
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Create a batch of requests
const prompts = [
  'I love this product!',
  'This is terrible.',
  "It's okay I guess.",
];

async function processBatch() {
  // Create the batch
  const batchId = await createObjectBatch(model, prompts, responseSchema);

  // Poll for results
  while (true) {
    const { batch, results } = await getObjectBatch(model, batchId);

    if (batch.status === 'completed') {
      console.log('Results:', results);
      break;
    }

    if (batch.status === 'failed') {
      console.error('Batch failed');
      break;
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
```

### Configuration

Both OpenAI and Anthropic models accept the following configuration options:

```typescript
interface LanguageModelConfig {
  apiKey: string;
  organization?: string; // OpenAI only
  baseUrl?: string; // Custom API endpoint
}
```

## API Reference

### Factory Functions

#### `openai(modelId: string, config: LanguageModelConfig): LanguageModel`

Creates an OpenAI language model instance.

#### `anthropic(modelId: string, config: LanguageModelConfig): LanguageModel`

Creates an Anthropic language model instance.

### Batch Operations

#### `createObjectBatch<T>(model: LanguageModel, prompts: string[], outputSchema: z.ZodSchema<T>): Promise<string>`

Creates a new batch of requests.

- `model`: The language model to use
- `prompts`: Array of prompts to process
- `outputSchema`: Zod schema for validating and typing the output
- Returns: Promise resolving to the batch ID

#### `getObjectBatch(model: LanguageModel, batchId: string): Promise<{ batch: Batch; results?: BatchResponse<unknown>[]; }>`

Gets the status and results of a batch.

- `model`: The language model that created the batch
- `batchId`: The ID of the batch to retrieve
- Returns: Promise resolving to the batch status and results (if available)

### Types

#### `BatchStatus`

```typescript
type BatchStatus =
  | 'validating'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelling'
  | 'cancelled';
```

#### `Batch`

```typescript
interface Batch {
  id: string;
  status: BatchStatus;
  requestCounts: {
    total: number;
    completed: number;
    failed: number;
    processing?: number;
    cancelled?: number;
    expired?: number;
  };
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, string>;
}
```

#### `BatchResponse<T>`

```typescript
interface BatchResponse<T> {
  customId: string;
  output?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

## Error Handling

The SDK throws `BatchError` instances for various error conditions:

```typescript
class BatchError extends Error {
  constructor(message: string, public code: string, public batchId?: string);
}
```

Common error codes:

- `batch_creation_failed`
- `batch_retrieval_failed`
- `results_not_ready`
- `results_retrieval_failed`
- `batch_cancellation_failed`

## License

MIT
