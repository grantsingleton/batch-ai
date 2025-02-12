import { z } from 'zod';
import { AnthropicLanguageModel } from '../providers/anthropic';
import { BatchError } from '../types';

// Mock the Anthropic client
const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockCancel = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn().mockImplementation(() => ({
    messages: {
      batches: {
        create: mockCreate,
        retrieve: mockRetrieve,
        cancel: mockCancel,
      },
    },
  })),
}));

// Mock global fetch for results retrieval
global.fetch = jest.fn();

describe('AnthropicLanguageModel', () => {
  let model: AnthropicLanguageModel;

  // This runs before each test
  beforeEach(() => {
    // Clear all mocks between tests
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockCreate.mockClear();
    mockRetrieve.mockClear();
    mockCancel.mockClear();

    // Set default successful responses
    mockCreate.mockResolvedValue({
      id: 'batch_abc123',
      type: 'message_batch',
      processing_status: 'in_progress',
    });

    mockRetrieve.mockResolvedValue({
      id: 'batch_abc123',
      processing_status: 'ended',
      request_counts: {
        processing: 0,
        succeeded: 2,
        errored: 0,
        canceled: 0,
        expired: 0,
      },
      created_at: '2024-02-12T00:00:00Z',
      ended_at: '2024-02-12T00:01:00Z',
      expires_at: '2024-02-13T00:00:00Z',
      results_url: 'https://api.anthropic.com/results',
    });

    mockCancel.mockResolvedValue(undefined);

    // Create a new model instance for each test
    model = new AnthropicLanguageModel('claude-3-opus-20240229', {
      apiKey: 'test-api-key',
    });
  });

  describe('createBatch', () => {
    const testSchema = z.object({
      response: z.string(),
    });

    const testRequests = [
      { customId: 'test-1', input: 'Hello world' },
      { customId: 'test-2', input: 'How are you?' },
    ];

    it('should successfully create a batch', async () => {
      // Mock the Anthropic API response
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.create.mockResolvedValue({
        id: 'batch_abc123',
        type: 'message_batch',
        processing_status: 'in_progress',
      });

      // Execute the test
      const batchId = await model.createBatch(testRequests, testSchema);

      // Verify the results
      expect(batchId).toBe('batch_abc123');
      expect(mockAnthropic.messages.batches.create).toHaveBeenCalledWith({
        requests: expect.arrayContaining([
          expect.objectContaining({
            custom_id: 'test-1',
            params: expect.objectContaining({
              model: 'claude-3-opus-20240229',
              messages: [{ role: 'user', content: 'Hello world' }],
            }),
          }),
        ]),
      });
    });

    it('should handle API errors gracefully', async () => {
      // Mock the Anthropic API to throw an error
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.create.mockRejectedValueOnce(
        new Error('API error')
      );

      // Execute the test and verify error handling
      await expect(model.createBatch(testRequests, testSchema)).rejects.toThrow(
        BatchError
      );
    });
  });

  describe('getBatch', () => {
    it('should retrieve batch status correctly', async () => {
      // Mock the Anthropic API response
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.retrieve.mockResolvedValue({
        id: 'batch_abc123',
        type: 'message_batch',
        processing_status: 'ended',
        request_counts: {
          processing: 0,
          succeeded: 2,
          errored: 0,
          canceled: 0,
          expired: 0,
        },
        created_at: '2024-02-12T00:00:00Z',
        ended_at: '2024-02-12T00:01:00Z',
        expires_at: '2024-02-13T00:00:00Z',
      });

      // Execute the test
      const batch = await model.getBatch('batch_abc123');

      // Verify the results
      expect(batch.id).toBe('batch_abc123');
      expect(batch.status).toBe('completed');
      expect(batch.requestCounts.total).toBe(2);
      expect(batch.requestCounts.completed).toBe(2);
      expect(batch.requestCounts.failed).toBe(0);
      expect(batch.createdAt).toBeInstanceOf(Date);
      expect(batch.completedAt).toBeInstanceOf(Date);
      expect(batch.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('getBatchResults', () => {
    it('should retrieve and parse results correctly', async () => {
      // Mock the Anthropic API responses
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.retrieve.mockResolvedValue({
        id: 'batch_abc123',
        processing_status: 'ended',
        results_url: 'https://api.anthropic.com/results',
      });

      // Mock the fetch response for results
      (global.fetch as jest.Mock).mockResolvedValue({
        text: () =>
          Promise.resolve(`
          {"custom_id":"test-1","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"Hello!"}]}}}
          {"custom_id":"test-2","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"Hi there!"}]}}}
        `),
      });

      // Execute the test
      const results = await model.getBatchResults('batch_abc123');

      // Verify the results
      expect(results).toHaveLength(2);
      expect(results[0].customId).toBe('test-1');
      expect(results[0].output).toBe('Hello!');
      expect(results[1].customId).toBe('test-2');
      expect(results[1].output).toBe('Hi there!');
    });

    it('should handle missing results URL', async () => {
      // Mock the Anthropic API to return no results URL
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.retrieve.mockResolvedValueOnce({
        id: 'batch_abc123',
        processing_status: 'in_progress',
        results_url: null,
      });

      // Execute the test and verify error handling
      await expect(model.getBatchResults('batch_abc123')).rejects.toThrow(
        'Batch results not yet available'
      );
    });

    it('should handle failed requests in results', async () => {
      // Mock the Anthropic API responses
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.retrieve.mockResolvedValue({
        id: 'batch_abc123',
        processing_status: 'ended',
        results_url: 'https://api.anthropic.com/results',
      });

      // Mock the fetch response with a failed request
      (global.fetch as jest.Mock).mockResolvedValue({
        text: () =>
          Promise.resolve(`
          {"custom_id":"test-1","result":{"type":"errored","error":{"message":"Rate limit exceeded"}}}
        `),
      });

      // Execute the test
      const results = await model.getBatchResults('batch_abc123');

      // Verify the results
      expect(results).toHaveLength(1);
      expect(results[0].customId).toBe('test-1');
      expect(results[0].output).toBeUndefined();
      expect(results[0].error).toEqual({
        code: 'errored',
        message: 'Rate limit exceeded',
      });
    });
  });

  describe('cancelBatch', () => {
    it('should cancel a batch successfully', async () => {
      // Mock the Anthropic API
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.cancel.mockResolvedValueOnce(undefined);

      // Execute the test
      await model.cancelBatch('batch_abc123');

      // Verify the API was called
      expect(mockAnthropic.messages.batches.cancel).toHaveBeenCalledWith(
        'batch_abc123'
      );
    });

    it('should handle cancellation errors', async () => {
      // Mock the Anthropic API to throw an error
      const Anthropic = require('@anthropic-ai/sdk').Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.cancel.mockRejectedValueOnce(
        new Error('Cannot cancel completed batch')
      );

      // Execute the test and verify error handling
      await expect(model.cancelBatch('batch_abc123')).rejects.toThrow(
        BatchError
      );
    });
  });
});
