# batch-ai

[![npm version](https://img.shields.io/npm/v/batch-ai.svg)](https://www.npmjs.com/package/batch-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

A unified TypeScript SDK for making batch AI requests across different model providers. Process thousands of prompts efficiently using official batch APIs from OpenAI and Anthropic.

Inspired by the [Vercel AI SDK](https://sdk.vercel.ai/docs), this library aims to provide a unified interface for batch processing across different AI providers. Just like Vercel's SDK allows developers to easily switch between different LLM providers without changing their application code, batch-ai lets you handle large-scale batch processing with the same simplicity - write once, run with any supported provider.

## Features

- 🚀 **Unified Interface**: Single API for multiple AI providers
- 🔒 **Type Safety**: Full TypeScript support with Zod schema validation
- 📦 **Provider Support**:
  - OpenAI (gpt-4o, etc)
  - Anthropic (Claude 3.5 Sonnet, etc)
  - Coming Soon:
    - Google (Gemini)
    - xAI (Grok)
    - _Want another provider? [Open an issue](https://github.com/grantsingleton/batch-ai/issues/new)!_
- 🛠️ **Batch Operations**:
  - `createObjectBatch`: Generate structured outputs (JSON) from prompts
  - Coming Soon:
    - `generateTextBatch`: Generate free-form text responses
    - _Want to speed up text batch development? [Open an issue](https://github.com/grantsingleton/batch-ai/issues/new)!_
- ⚡ **Performance**: Process thousands of prompts efficiently
- 🔍 **Error Handling**: Robust error handling with detailed error types

## System Prompts

batch-ai supports system prompts for both OpenAI and Anthropic models. System prompts help you guide the model's behavior without taking up space in your input text.

To use system prompts, simply add the optional `systemPrompt` property to your requests:

```typescript
const requests = [
  {
    customId: "task-1",
    input: "What is the capital of France?",
    systemPrompt:
      "You are a helpful geography expert. Provide concise answers.",
  },
];
```

System prompts are completely optional and can be omitted if not needed.

## Installation

```bash
npm install batch-ai
# or
yarn add batch-ai
# or
pnpm add batch-ai
```

## Quick Start

### API Key Configuration

You can configure your API keys in one of two ways:

1. Environment Variables (Recommended):

```bash
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
```

2. Explicit Configuration:

```typescript
const model = openai("gpt-4o", {
  apiKey: "sk-...", // Your OpenAI API key
});

// or
const model = anthropic("claude-3-5-sonnet-20241022", {
  apiKey: "sk-...", // Your Anthropic API key
});
```

### Basic Usage

```typescript
import { z } from "zod";
import { openai, createObjectBatch, getObjectBatch } from "batch-ai";

// Define your output schema using Zod
const responseSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

// Initialize the model
const model = openai("gpt-4o", {
  apiKey: process.env.OPENAI_API_KEY, // Optional if set in environment
});

// Prepare your batch requests
const requests = [
  {
    customId: "review-1",
    input: "I absolutely love this product! Best purchase ever.",
    systemPrompt:
      "You are a sentiment analysis assistant. Analyze the sentiment of the review provided.",
  },
  {
    customId: "review-2",
    input: "This is terrible, would not recommend.",
    systemPrompt:
      "You are a sentiment analysis assistant. Analyze the sentiment of the review provided.",
  },
];

// Create a new batch
const { batchId } = await createObjectBatch({
  model,
  requests,
  outputSchema: responseSchema,
});

// Later, retrieve the batch results
const { batch, results } = await getObjectBatch({
  model,
  batchId,
});

// Check batch status
if (batch.status === "completed" && results) {
  console.log("Results:", results);
  // [
  //   {
  //     customId: 'review-1',
  //     output: { sentiment: 'positive', confidence: 0.98 }
  //   },
  //   {
  //     customId: 'review-2',
  //     output: { sentiment: 'negative', confidence: 0.95 }
  //   }
  // ]
}
```

## Supported Providers

### OpenAI

```typescript
import { openai } from "batch-ai";

const model = openai("gpt-4o", {
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Anthropic

```typescript
import { anthropic } from "batch-ai";

const model = anthropic("claude-3-5-sonnet-20241022", {
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## API Reference

### Factory Functions

#### `openai(modelId: OpenAIModel, config?: LanguageModelConfig)`

Creates an OpenAI language model instance.

```typescript
interface LanguageModelConfig {
  apiKey?: string;
}
```

#### `anthropic(modelId: AnthropicModel, config?: LanguageModelConfig)`

Creates an Anthropic language model instance.

### Batch Operations

#### `createObjectBatch`

Creates a new batch of requests.

```typescript
interface CreateObjectBatchParams {
  model: LanguageModel;
  requests: BatchRequest<string>[];
  outputSchema: z.ZodSchema<unknown>;
}

interface CreateObjectBatchResponse {
  batchId: string;
}
```

#### `getObjectBatch`

Retrieves batch status and results.

```typescript
interface GetObjectBatchParams {
  model: LanguageModel;
  batchId: string;
}

// Returns
interface {
  batch: Batch;
  results?: BatchResponse<TOutput>[];
}
```

### Types

#### `BatchStatus`

```typescript
type BatchStatus =
  | "validating"
  | "in_progress"
  | "completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled";
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
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Error Handling

The SDK throws typed `BatchError` instances:

```typescript
class BatchError extends Error {
  constructor(message: string, public code: string, public batchId?: string);
}
```

Common error codes:

- `batch_creation_failed`: Failed to create a new batch
- `batch_retrieval_failed`: Failed to retrieve batch status
- `results_not_ready`: Batch results are not yet available
- `results_retrieval_failed`: Failed to retrieve batch results
- `batch_cancellation_failed`: Failed to cancel batch

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```

```
