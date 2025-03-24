# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
