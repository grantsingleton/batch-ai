# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-08

### Added

- Support for image inputs in batch requests
- Common `ContentPart` interface for unified input format across providers
- Image support for both OpenAI and Anthropic providers

### Changed

- **BREAKING**: Input format changed from string to ContentPart[] for all providers
- Unified input format across OpenAI and Anthropic providers

### Migration Guide

#### Migrating from 0.x to 1.0

The input format for batch requests has changed from simple strings to an array of ContentPart objects. This change enables support for multimodal inputs (text and images) while providing a consistent API across all providers.

##### Before (0.x)

```typescript
// OpenAI
const requests = [
  {
    customId: "review-1",
    input: "I absolutely love this product!",
    systemPrompt: "You are a sentiment analysis assistant.",
  },
];

// Anthropic
const requests = [
  {
    customId: "review-1",
    input: "I absolutely love this product!",
    systemPrompt: "You are a sentiment analysis assistant.",
  },
];
```

##### After (1.0)

```typescript
// Both OpenAI and Anthropic now use the same format
const requests = [
  {
    customId: "review-1",
    input: [
      {
        type: "text",
        text: "I absolutely love this product!",
      },
    ],
    systemPrompt: "You are a sentiment analysis assistant.",
  },
];

// With image support
const requests = [
  {
    customId: "review-2",
    input: [
      { type: "text", text: "What's in this image?" },
      {
        type: "image_url",
        image_url: {
          url: "https://example.com/image.jpg",
        },
      },
    ],
  },
];
```

##### Quick Migration

To quickly update your code, wrap your string inputs in the new format:

```typescript
// Old code
const request = { customId: "1", input: "Hello world" };

// New code
const request = {
  customId: "1",
  input: [{ type: "text", text: "Hello world" }],
};
```

## [0.1.7] - 2025-03-24

### Added

- Support for system prompts in batch requests via the optional `systemPrompt` property
- Detailed documentation and examples for using system prompts

## [0.1.0] - 2025-02-14

### Added

- Initial release of the batch-ai SDK
- Support for OpenAI and Anthropic batch processing
- `createObjectBatch` for generating structured JSON outputs
- Type-safe responses using Zod schemas
- Comprehensive error handling with detailed error types
- Environment variable and explicit API key configuration
- TypeScript support with full type definitions
- Support for latest models:
  - OpenAI: gpt-4o and others
  - Anthropic: claude-3-5-sonnet-20241022 and others
