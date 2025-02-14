import { z } from 'zod';
import {
  openai,
  anthropic,
  createObjectBatch,
  getObjectBatch,
  BatchError,
} from '../index';

// Mock the provider implementations
jest.mock('../providers/openai', () => ({
  OpenAILanguageModel: jest.fn().mockImplementation(() => ({
    provider: 'openai',
    modelId: 'gpt-4',
    createBatch: jest.fn(),
    getBatch: jest.fn(),
    getBatchResults: jest.fn(),
  })),
}));

jest.mock('../providers/anthropic', () => ({
  AnthropicLanguageModel: jest.fn().mockImplementation(() => ({
    provider: 'anthropic',
    modelId: 'claude-3-opus-20240229',
    createBatch: jest.fn(),
    getBatch: jest.fn(),
    getBatchResults: jest.fn(),
  })),
}));

describe('SDK Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createObjectBatch', () => {
    const testSchema = z.object({
      sentiment: z.enum(['positive', 'negative', 'neutral']),
      confidence: z.number(),
    });

    const prompts = [
      'I love this product!',
      'This is terrible.',
      "It's okay I guess.",
    ];

    it('should create a batch with OpenAI provider', async () => {
      const model = openai('gpt-4', { apiKey: 'test-key' });
      (model.createBatch as jest.Mock).mockResolvedValue('batch-123');

      const batchId = await createObjectBatch({
        model,
        requests: prompts.map((prompt, index) => ({
          customId: `request-${index}`,
          input: prompt,
        })),
        outputSchema: testSchema,
      });

      expect(batchId.batchId).toBe('batch-123');
      expect(model.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            customId: expect.any(String),
            input: 'I love this product!',
          }),
        ]),
        testSchema
      );
    });

    it('should create a batch with Anthropic provider', async () => {
      const model = anthropic('claude-3-opus-20240229', { apiKey: 'test-key' });
      (model.createBatch as jest.Mock).mockResolvedValue('batch_abc123');

      const batchId = await createObjectBatch({
        model,
        requests: prompts.map((prompt, index) => ({
          customId: `request-${index}`,
          input: prompt,
        })),
        outputSchema: testSchema,
      });

      expect(batchId.batchId).toBe('batch_abc123');
      expect(model.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            customId: expect.any(String),
            input: 'I love this product!',
          }),
        ]),
        testSchema
      );
    });

    it('should handle provider errors', async () => {
      const model = openai('gpt-4', { apiKey: 'test-key' });
      (model.createBatch as jest.Mock).mockRejectedValue(
        new BatchError('API error', 'batch_creation_failed')
      );

      await expect(
        createObjectBatch({
          model,
          requests: prompts.map((prompt, index) => ({
            customId: `request-${index}`,
            input: prompt,
          })),
          outputSchema: testSchema,
        })
      ).rejects.toThrow(BatchError);
    });
  });

  describe('getObjectBatch', () => {
    it('should get batch status and results when completed', async () => {
      const model = openai('gpt-4', { apiKey: 'test-key' });
      (model.getBatch as jest.Mock).mockResolvedValue({
        id: 'batch-123',
        status: 'completed',
        requestCounts: {
          total: 3,
          completed: 3,
          failed: 0,
        },
        createdAt: new Date(),
      });
      (model.getBatchResults as jest.Mock).mockResolvedValue([
        {
          customId: 'request-0',
          output: { sentiment: 'positive', confidence: 0.9 },
        },
        {
          customId: 'request-1',
          output: { sentiment: 'negative', confidence: 0.8 },
        },
        {
          customId: 'request-2',
          output: { sentiment: 'neutral', confidence: 0.6 },
        },
      ]);

      const result = await getObjectBatch({
        model,
        batchId: 'batch-123',
      });

      expect(result.batch.status).toBe('completed');
      expect(result.results).toHaveLength(3);
      expect(result.results![0].output).toEqual({
        sentiment: 'positive',
        confidence: 0.9,
      });
    });

    it('should only return batch status when not completed', async () => {
      const model = openai('gpt-4', { apiKey: 'test-key' });
      (model.getBatch as jest.Mock).mockResolvedValue({
        id: 'batch-123',
        status: 'in_progress',
        requestCounts: {
          total: 3,
          completed: 1,
          failed: 0,
        },
        createdAt: new Date(),
      });

      const result = await getObjectBatch({
        model,
        batchId: 'batch-123',
      });

      expect(result.batch.status).toBe('in_progress');
      expect(result.results).toBeUndefined();
      expect(model.getBatchResults).not.toHaveBeenCalled();
    });

    it('should handle provider errors', async () => {
      const model = openai('gpt-4', { apiKey: 'test-key' });
      (model.getBatch as jest.Mock).mockRejectedValue(
        new BatchError('API error', 'batch_retrieval_failed', 'batch-123')
      );

      await expect(
        getObjectBatch({
          model,
          batchId: 'batch-123',
        })
      ).rejects.toThrow(BatchError);
    });
  });
});
