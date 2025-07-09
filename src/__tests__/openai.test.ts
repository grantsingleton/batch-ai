import { z } from "zod";
import { OpenAILanguageModel } from "../providers/openai";
import { BatchError, BatchRequest, ContentPart } from "../types";

// Mock the OpenAI client
const mockCreate = jest.fn();
const mockContent = jest.fn();
const mockBatchCreate = jest.fn();
const mockBatchRetrieve = jest.fn();
const mockBatchCancel = jest.fn();

jest.mock("openai", () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    files: {
      create: mockCreate,
      content: mockContent,
    },
    batches: {
      create: mockBatchCreate,
      retrieve: mockBatchRetrieve,
      cancel: mockBatchCancel,
    },
  })),
}));

// Mock the file system operations
jest.mock("fs", () => ({
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
  createReadStream: jest.fn(),
}));

describe("OpenAILanguageModel", () => {
  let model: OpenAILanguageModel;

  // This runs before each test
  beforeEach(() => {
    // Clear all mocks between tests
    jest.clearAllMocks();
    mockCreate.mockClear();
    mockContent.mockClear();
    mockBatchCreate.mockClear();
    mockBatchRetrieve.mockClear();
    mockBatchCancel.mockClear();

    // Set default successful responses
    mockCreate.mockResolvedValue({
      id: "file-123",
    });

    mockBatchCreate.mockResolvedValue({
      id: "batch-123",
      status: "validating",
    });

    mockBatchRetrieve.mockResolvedValue({
      id: "batch-123",
      status: "completed",
      request_counts: {
        total: 2,
        completed: 2,
        failed: 0,
      },
      created_at: 1677610602,
      completed_at: 1677610702,
      expires_at: 1677697002,
      output_file_id: "file-456",
    });

    mockContent.mockResolvedValue({
      text: () =>
        Promise.resolve(`
        {"custom_id":"test-1","response":{"status_code":200,"body":{"choices":[{"message":{"content":"{\\\"sentiment\\\":\\\"positive\\\",\\\"confidence\\\":0.9}"}}]}}}
        {"custom_id":"test-2","response":{"status_code":200,"body":{"choices":[{"message":{"content":"{\\\"sentiment\\\":\\\"negative\\\",\\\"confidence\\\":0.8}"}}]}}}
      `),
    });

    // Create a new model instance for each test
    model = new OpenAILanguageModel("gpt-4", {
      apiKey: "test-api-key",
    });
  });

  describe("createBatch", () => {
    const testSchema = z.object({
      response: z.string(),
    });

    const testRequests: BatchRequest<ContentPart[]>[] = [
      {
        customId: "test-1",
        input: [
          { type: "text" as const, text: "Hello world" },
          {
            type: "image_url" as const,
            image_url: {
              url: "test_url", // Use the resolved CDN URL
            },
          },
        ],
      },
      {
        customId: "test-2",
        input: [{ type: "text" as const, text: "How are you?" }],
      },
    ];

    it("should successfully create a batch", async () => {
      // Mock the file operations
      const fs = require("fs");
      fs.promises.writeFile.mockResolvedValue(undefined);
      fs.promises.unlink.mockResolvedValue(undefined);
      fs.createReadStream.mockReturnValue("mock-stream");

      // Execute the test
      const batchId = await model.createBatch(testRequests, testSchema);

      // Verify the results
      expect(batchId).toBe("batch-123");
      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith({
        file: "mock-stream",
        purpose: "batch",
      });
      expect(mockBatchCreate).toHaveBeenCalledWith({
        input_file_id: "file-123",
        endpoint: "/v1/chat/completions",
        completion_window: "24h",
      });
      expect(fs.promises.unlink).toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      // Mock the file operations
      const fs = require("fs");
      fs.promises.writeFile.mockResolvedValue(undefined);
      fs.createReadStream.mockReturnValue("mock-stream");

      // Mock the API to throw an error
      mockCreate.mockRejectedValueOnce(new Error("API error"));

      // Execute the test and verify error handling
      await expect(model.createBatch(testRequests, testSchema)).rejects.toThrow(
        BatchError
      );
    });

    it("should include system prompt in messages when provided", async () => {
      const schema = z.object({ test: z.string() });
      const requests: BatchRequest<ContentPart[]>[] = [
        {
          customId: "test-1",
          input: [{ type: "text", text: "Hello" }],
          systemPrompt: "You are a helpful assistant",
        },
      ];

      // Set up mocks
      mockCreate.mockResolvedValue({ id: "file-123" });
      mockBatchCreate.mockResolvedValue({ id: "batch-123" });

      await model.createBatch(requests, schema);

      // Verify write file was called with the correct content
      const writeFileMock = require("fs").promises.writeFile;
      const jsonlContent = writeFileMock.mock.calls[0][1];

      // Check that the JSON contains the system prompt and correct user content
      const parsed = JSON.parse(jsonlContent);
      expect(parsed.body.messages).toEqual([
        {
          role: "system",
          content: "You are a helpful assistant",
        },
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ]);
    });

    it("should not include system message when systemPrompt is not provided", async () => {
      const schema = z.object({ test: z.string() });
      const requests: BatchRequest<ContentPart[]>[] = [
        {
          customId: "test-1",
          input: [{ type: "text", text: "Hello" }],
          // No systemPrompt here
        },
      ];

      // Set up mocks
      mockCreate.mockResolvedValue({ id: "file-123" });
      mockBatchCreate.mockResolvedValue({ id: "batch-123" });

      await model.createBatch(requests, schema);

      // Verify write file was called with the correct content
      const writeFileMock = require("fs").promises.writeFile;
      const jsonlContent = writeFileMock.mock.calls[0][1];

      // Check that the JSON doesn't contain a system message
      const parsed = JSON.parse(jsonlContent);
      expect(parsed.body.messages).toEqual([
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ]);
    });
  });

  describe("getBatch", () => {
    it("should retrieve batch status correctly", async () => {
      // Execute the test
      const batch = await model.getBatch("batch-123");

      // Verify the results
      expect(batch.id).toBe("batch-123");
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
      // Execute the test
      const results = await model.getBatchResults("batch-123");

      // Verify the results
      expect(results).toHaveLength(2);
      expect(results[0].customId).toBe("test-1");
      expect(results[0].output).toEqual({
        sentiment: "positive",
        confidence: 0.9,
      });
      expect(results[1].customId).toBe("test-2");
      expect(results[1].output).toEqual({
        sentiment: "negative",
        confidence: 0.8,
      });
    });

    it("should handle missing output file", async () => {
      // Mock the API to return no output file
      mockBatchRetrieve.mockResolvedValueOnce({
        id: "batch-123",
        status: "in_progress",
      });

      // Execute the test and verify error handling
      await expect(model.getBatchResults("batch-123")).rejects.toThrow(
        "Batch results not yet available"
      );
    });
  });
});
