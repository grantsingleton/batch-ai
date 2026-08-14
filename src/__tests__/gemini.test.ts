import { z } from "zod";
import { GeminiLanguageModel } from "../providers/gemini";
import { BatchError, BatchRequest, ContentPart } from "../types";

// Mock the GoogleGenAI client
const mockFileUpload = jest.fn();
const mockFileDownload = jest.fn();
const mockBatchCreate = jest.fn();
const mockBatchGet = jest.fn();
const mockBatchCancel = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    files: {
      upload: mockFileUpload,
      download: mockFileDownload,
    },
    batches: {
      create: mockBatchCreate,
      get: mockBatchGet,
      cancel: mockBatchCancel,
    },
  })),
}));

// Mock the file system operations
jest.mock("fs", () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

const resultsJsonl = [
  JSON.stringify({
    key: "test-1",
    response: {
      candidates: [
        {
          content: {
            parts: [{ text: '{"sentiment":"positive","confidence":0.9}' }],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
      },
    },
  }),
  JSON.stringify({
    key: "test-2",
    error: { code: 429, message: "Resource exhausted" },
  }),
].join("\n");

describe("GeminiLanguageModel", () => {
  let model: GeminiLanguageModel;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileUpload.mockResolvedValue({ name: "files/input-123" });
    mockBatchCreate.mockResolvedValue({
      name: "batches/batch-123",
      state: "JOB_STATE_PENDING",
    });
    mockBatchGet.mockResolvedValue({
      name: "batches/batch-123",
      state: "JOB_STATE_SUCCEEDED",
      createTime: "2026-08-14T10:00:00Z",
      endTime: "2026-08-14T11:00:00Z",
      dest: { fileName: "files/output-456" },
    });
    mockFileDownload.mockResolvedValue(undefined);

    const fs = require("fs");
    fs.promises.writeFile.mockResolvedValue(undefined);
    fs.promises.unlink.mockResolvedValue(undefined);
    fs.promises.readFile.mockResolvedValue(resultsJsonl);

    model = new GeminiLanguageModel("gemini-3.6-flash", {
      apiKey: "test-api-key",
    });
  });

  const testSchema = z.object({
    sentiment: z.string(),
    confidence: z.number(),
  });

  const testRequests: BatchRequest<ContentPart[]>[] = [
    {
      customId: "test-1",
      input: [{ type: "text" as const, text: "I love this product!" }],
      systemPrompt: "You are a sentiment analyzer.",
    },
    {
      customId: "test-2",
      input: [{ type: "text" as const, text: "This is terrible." }],
    },
  ];

  describe("createBatch", () => {
    it("should successfully create a batch", async () => {
      const batchId = await model.createBatch(testRequests, testSchema);

      expect(batchId).toBe("batches/batch-123");
      expect(mockFileUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { mimeType: "jsonl" },
        })
      );
      expect(mockBatchCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3.6-flash",
          src: "files/input-123",
        })
      );
    });

    it("should write JSONL with keys, system instruction, and JSON response config", async () => {
      await model.createBatch(testRequests, testSchema);

      const fs = require("fs");
      const written = fs.promises.writeFile.mock.calls[0][1] as string;
      const lines = written.split("\n").map((l: string) => JSON.parse(l));

      expect(lines).toHaveLength(2);
      expect(lines[0].key).toBe("test-1");
      expect(lines[0].request.contents[0].parts[0].text).toBe(
        "I love this product!"
      );
      expect(lines[0].request.system_instruction.parts[0].text).toBe(
        "You are a sentiment analyzer."
      );
      expect(lines[0].request.generation_config.response_mime_type).toBe(
        "application/json"
      );
      expect(
        lines[0].request.generation_config.response_json_schema
      ).toBeDefined();
      expect(lines[1].key).toBe("test-2");
      expect(lines[1].request.system_instruction).toBeUndefined();
    });

    it("should reject image inputs with a clear error", async () => {
      const imageRequests: BatchRequest<ContentPart[]>[] = [
        {
          customId: "img-1",
          input: [
            {
              type: "image_url" as const,
              image_url: { url: "https://example.com/image.jpg" },
            },
          ],
        },
      ];

      await expect(
        model.createBatch(imageRequests, testSchema)
      ).rejects.toThrow(BatchError);
      await expect(
        model.createBatch(imageRequests, testSchema)
      ).rejects.toThrow(/not supported by the Gemini provider/);
    });

    it("should throw BatchError when batch creation fails", async () => {
      mockBatchCreate.mockRejectedValue(new Error("API error"));

      await expect(model.createBatch(testRequests, testSchema)).rejects.toThrow(
        BatchError
      );
      try {
        await model.createBatch(testRequests, testSchema);
      } catch (error) {
        expect((error as BatchError).code).toBe("batch_creation_failed");
      }
    });
  });

  describe("getBatch", () => {
    it("should map a succeeded job to completed status", async () => {
      const batch = await model.getBatch("batches/batch-123");

      expect(batch.id).toBe("batches/batch-123");
      expect(batch.status).toBe("completed");
      expect(batch.createdAt).toEqual(new Date("2026-08-14T10:00:00Z"));
      expect(batch.completedAt).toEqual(new Date("2026-08-14T11:00:00Z"));
    });

    it.each([
      ["JOB_STATE_PENDING", "validating"],
      ["JOB_STATE_RUNNING", "in_progress"],
      ["JOB_STATE_FAILED", "failed"],
      ["JOB_STATE_EXPIRED", "expired"],
      ["JOB_STATE_CANCELLED", "cancelled"],
    ])("should map %s to %s", async (jobState, expected) => {
      mockBatchGet.mockResolvedValue({
        name: "batches/batch-123",
        state: jobState,
      });

      const batch = await model.getBatch("batches/batch-123");
      expect(batch.status).toBe(expected);
    });

    it("should throw BatchError when retrieval fails", async () => {
      mockBatchGet.mockRejectedValue(new Error("Not found"));

      await expect(model.getBatch("batches/missing")).rejects.toThrow(
        BatchError
      );
    });
  });

  describe("getBatchResults", () => {
    it("should parse results with outputs, usage, and per-request errors", async () => {
      const results = await model.getBatchResults("batches/batch-123");

      expect(results).toHaveLength(2);

      expect(results[0].customId).toBe("test-1");
      expect(results[0].output).toEqual({
        sentiment: "positive",
        confidence: 0.9,
      });
      expect(results[0].usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(results[0].error).toBeUndefined();

      expect(results[1].customId).toBe("test-2");
      expect(results[1].output).toBeUndefined();
      expect(results[1].error).toEqual({
        code: "429",
        message: "Resource exhausted",
      });
    });

    it("should surface unparseable output as output_parse_failed", async () => {
      const fs = require("fs");
      fs.promises.readFile.mockResolvedValue(
        JSON.stringify({
          key: "test-1",
          response: {
            candidates: [{ content: { parts: [{ text: "not json" }] } }],
          },
        })
      );

      const results = await model.getBatchResults("batches/batch-123");

      expect(results[0].output).toBeUndefined();
      expect(results[0].error?.code).toBe("output_parse_failed");
    });

    it("should throw results_not_ready while the job is still running", async () => {
      mockBatchGet.mockResolvedValue({
        name: "batches/batch-123",
        state: "JOB_STATE_RUNNING",
      });

      try {
        await model.getBatchResults("batches/batch-123");
        fail("Expected BatchError");
      } catch (error) {
        expect((error as BatchError).code).toBe("results_not_ready");
      }
    });

    it("should throw results_retrieval_failed for a failed job", async () => {
      mockBatchGet.mockResolvedValue({
        name: "batches/batch-123",
        state: "JOB_STATE_FAILED",
      });

      try {
        await model.getBatchResults("batches/batch-123");
        fail("Expected BatchError");
      } catch (error) {
        expect((error as BatchError).code).toBe("results_retrieval_failed");
      }
    });
  });

  describe("cancelBatch", () => {
    it("should cancel a batch", async () => {
      mockBatchCancel.mockResolvedValue(undefined);

      await model.cancelBatch("batches/batch-123");

      expect(mockBatchCancel).toHaveBeenCalledWith({
        name: "batches/batch-123",
      });
    });

    it("should throw BatchError when cancellation fails", async () => {
      mockBatchCancel.mockRejectedValue(new Error("Cannot cancel"));

      try {
        await model.cancelBatch("batches/batch-123");
        fail("Expected BatchError");
      } catch (error) {
        expect((error as BatchError).code).toBe("batch_cancellation_failed");
      }
    });
  });
});
