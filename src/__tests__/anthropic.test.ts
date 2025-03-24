import { z } from "zod";
import { AnthropicLanguageModel } from "../providers/anthropic";
import { BatchError } from "../types";

// Mock the Anthropic client
const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockResults = jest.fn();
const mockCancel = jest.fn();

jest.mock("@anthropic-ai/sdk", () => ({
  Anthropic: jest.fn().mockImplementation(() => ({
    messages: {
      batches: {
        create: mockCreate,
        retrieve: mockRetrieve,
        results: mockResults,
        cancel: mockCancel,
      },
    },
  })),
}));

describe("AnthropicLanguageModel", () => {
  let model: AnthropicLanguageModel;

  // This runs before each test
  beforeEach(() => {
    // Clear all mocks between tests
    jest.clearAllMocks();
    mockCreate.mockClear();
    mockRetrieve.mockClear();
    mockResults.mockClear();
    mockCancel.mockClear();

    // Set default successful responses
    mockCreate.mockResolvedValue({
      id: "batch_abc123",
      type: "message_batch",
      processing_status: "in_progress",
    });

    mockRetrieve.mockResolvedValue({
      id: "batch_abc123",
      processing_status: "ended",
      request_counts: {
        processing: 0,
        succeeded: 2,
        errored: 0,
        canceled: 0,
        expired: 0,
      },
      created_at: "2024-02-12T00:00:00Z",
      ended_at: "2024-02-12T00:01:00Z",
      expires_at: "2024-02-13T00:00:00Z",
    });

    // Mock the results method to return an async iterator
    mockResults.mockResolvedValue({
      [Symbol.asyncIterator]: () => {
        const items = [
          {
            custom_id: "test-1",
            result: {
              type: "succeeded",
              message: {
                content: [
                  {
                    type: "tool_use",
                    name: "format_response",
                    input: {
                      response: { sentiment: "positive", confidence: 0.9 },
                    },
                  },
                ],
                usage: {
                  input_tokens: 100,
                  output_tokens: 50,
                },
              },
            },
          },
          {
            custom_id: "test-2",
            result: {
              type: "failed",
              error: {
                type: "api_error",
                message: "Failed to process request",
              },
            },
          },
        ];
        let index = 0;
        return {
          async next(): Promise<IteratorResult<any>> {
            if (index < items.length) {
              return { value: items[index++], done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    });

    mockCancel.mockResolvedValue(undefined);

    // Create a new model instance for each test
    model = new AnthropicLanguageModel("claude-3-opus-20240229", {
      apiKey: "test-api-key",
    });
  });

  describe("createBatch", () => {
    const testSchema = z.object({
      response: z.string(),
    });

    const testRequests = [
      { customId: "test-1", input: "Hello world" },
      { customId: "test-2", input: "How are you?" },
    ];

    it("should successfully create a batch", async () => {
      // Mock the Anthropic API response
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      const anthropicInstance = new Anthropic();

      anthropicInstance.messages.batches.create.mockResolvedValue({
        id: "batch_abc123",
        type: "message_batch",
        processing_status: "in_progress",
      });

      // Execute the test
      const batchId = await model.createBatch(testRequests, testSchema);

      // Verify the results
      expect(batchId).toBe("batch_abc123");
      expect(anthropicInstance.messages.batches.create).toHaveBeenCalledWith({
        requests: expect.arrayContaining([
          expect.objectContaining({
            custom_id: "test-1",
            params: expect.objectContaining({
              model: "claude-3-opus-20240229",
              messages: [{ role: "user", content: "Hello world" }],
            }),
          }),
        ]),
      });
    });

    it("should handle API errors gracefully", async () => {
      // Mock the Anthropic API to throw an error
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      const anthropicInstance = new Anthropic();

      anthropicInstance.messages.batches.create.mockRejectedValueOnce(
        new Error("API error")
      );

      // Execute the test and verify error handling
      await expect(model.createBatch(testRequests, testSchema)).rejects.toThrow(
        BatchError
      );
    });

    it("should include system prompt when provided", async () => {
      const schema = z.object({ test: z.string() });
      const requests = [
        {
          customId: "test-1",
          input: "Hello",
          systemPrompt: "You are a helpful assistant",
        },
      ];

      // Set up mocks
      mockCreate.mockResolvedValue({ id: "batch-123" });

      await model.createBatch(requests, schema);

      // Check that the system prompt was included in the request
      const createParams = mockCreate.mock.calls[0][0];
      expect(createParams.requests[0].params.system).toBe(
        "You are a helpful assistant"
      );
    });

    it("should not include system field when systemPrompt is not provided", async () => {
      const schema = z.object({ test: z.string() });
      const requests = [
        {
          customId: "test-1",
          input: "Hello",
          // No systemPrompt here
        },
      ];

      // Set up mocks
      mockCreate.mockResolvedValue({ id: "batch-123" });

      await model.createBatch(requests, schema);

      // Check that no system field was included in the request
      const createParams = mockCreate.mock.calls[0][0];
      expect(createParams.requests[0].params.system).toBeUndefined();
    });
  });

  describe("getBatch", () => {
    it("should retrieve batch status correctly", async () => {
      // Mock the Anthropic API response
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.retrieve.mockResolvedValue({
        id: "batch_abc123",
        type: "message_batch",
        processing_status: "ended",
        request_counts: {
          processing: 0,
          succeeded: 2,
          errored: 0,
          canceled: 0,
          expired: 0,
        },
        created_at: "2024-02-12T00:00:00Z",
        ended_at: "2024-02-12T00:01:00Z",
        expires_at: "2024-02-13T00:00:00Z",
      });

      // Execute the test
      const batch = await model.getBatch("batch_abc123");

      // Verify the results
      expect(batch.id).toBe("batch_abc123");
      expect(batch.status).toBe("completed");
      expect(batch.requestCounts.total).toBe(2);
      expect(batch.requestCounts.completed).toBe(2);
      expect(batch.requestCounts.failed).toBe(0);
      expect(batch.createdAt).toBeInstanceOf(Date);
      expect(batch.completedAt).toBeInstanceOf(Date);
      expect(batch.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("getBatchResults", () => {
    it("should retrieve and parse results correctly", async () => {
      // Mock the Anthropic API responses
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.retrieve.mockResolvedValue({
        id: "batch_abc123",
        processing_status: "ended",
      });

      mockAnthropic.messages.batches.results.mockResolvedValue({
        [Symbol.asyncIterator]: () => {
          const items = [
            {
              custom_id: "test-1",
              result: {
                type: "succeeded",
                message: {
                  content: [
                    {
                      type: "tool_use",
                      name: "format_response",
                      input: {
                        response: { sentiment: "positive", confidence: 0.9 },
                      },
                    },
                  ],
                  usage: {
                    input_tokens: 100,
                    output_tokens: 50,
                  },
                },
              },
            },
            {
              custom_id: "test-2",
              result: {
                type: "failed",
                error: {
                  type: "api_error",
                  message: "Failed to process request",
                },
              },
            },
          ];
          let index = 0;
          return {
            async next(): Promise<IteratorResult<any>> {
              if (index < items.length) {
                return { value: items[index++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
      });

      // Execute the test
      const results = await model.getBatchResults("batch_abc123");

      // Verify the results
      expect(results).toHaveLength(2);
      expect(results[0].customId).toBe("test-1");
      expect(results[0].output).toEqual({
        sentiment: "positive",
        confidence: 0.9,
      });
      expect(results[0].usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
      expect(results[1].customId).toBe("test-2");
      expect(results[1].output).toBeUndefined();
      expect(results[1].error).toEqual({
        code: "failed",
        message: "Request failed",
      });
    });

    it("should handle failed requests in results", async () => {
      // Mock the Anthropic API responses
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.retrieve.mockResolvedValue({
        id: "batch_abc123",
        processing_status: "ended",
      });

      mockAnthropic.messages.batches.results.mockResolvedValue({
        [Symbol.asyncIterator]: () => {
          const items = [
            {
              custom_id: "test-1",
              result: {
                type: "errored",
                error: {
                  message: "Rate limit exceeded",
                },
              },
            },
          ];
          let index = 0;
          return {
            async next(): Promise<IteratorResult<any>> {
              if (index < items.length) {
                return { value: items[index++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
      });

      // Execute the test
      const results = await model.getBatchResults("batch_abc123");

      // Verify the results
      expect(results).toHaveLength(1);
      expect(results[0].customId).toBe("test-1");
      expect(results[0].output).toBeUndefined();
      expect(results[0].error).toEqual({
        code: "errored",
        message: "Request failed",
      });
    });

    it("should handle batch not completed", async () => {
      // Mock the Anthropic API to return in_progress status
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      new Anthropic(); // Just instantiate to trigger the mock

      // Clear the default mocks from beforeEach
      mockRetrieve.mockReset();
      mockResults.mockReset();

      // Mock retrieve to return in_progress status
      mockRetrieve.mockResolvedValue({
        id: "batch_abc123",
        processing_status: "in_progress",
      });

      // Execute the test and verify error handling
      await expect(model.getBatchResults("batch_abc123")).rejects.toThrow(
        "Batch results not yet available"
      );

      // Verify results was not called
      expect(mockResults).not.toHaveBeenCalled();
    });
  });

  describe("cancelBatch", () => {
    it("should cancel a batch successfully", async () => {
      // Mock the Anthropic API
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.cancel.mockResolvedValueOnce(undefined);

      // Execute the test
      await model.cancelBatch("batch_abc123");

      // Verify the API was called
      expect(mockAnthropic.messages.batches.cancel).toHaveBeenCalledWith(
        "batch_abc123"
      );
    });

    it("should handle cancellation errors", async () => {
      // Mock the Anthropic API to throw an error
      const Anthropic = require("@anthropic-ai/sdk").Anthropic;
      const mockAnthropic = new Anthropic();

      mockAnthropic.messages.batches.cancel.mockRejectedValueOnce(
        new Error("Cannot cancel completed batch")
      );

      // Execute the test and verify error handling
      await expect(model.cancelBatch("batch_abc123")).rejects.toThrow(
        BatchError
      );
    });
  });
});
