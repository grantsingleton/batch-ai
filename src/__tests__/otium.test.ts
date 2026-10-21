import { z } from "zod";
import { OpenAI } from "openai";
import { OtiumLanguageModel, OTIUM_BASE_URL } from "../providers/otium";
import { otium } from "../index";
import { BatchError, BatchRequest, ContentPart } from "../types";

const mockFileCreate = jest.fn();
const mockContent = jest.fn();
const mockBatchCreate = jest.fn();
const mockBatchRetrieve = jest.fn();
const mockBatchCancel = jest.fn();

jest.mock("openai", () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    files: { create: mockFileCreate, content: mockContent },
    batches: {
      create: mockBatchCreate,
      retrieve: mockBatchRetrieve,
      cancel: mockBatchCancel,
    },
  })),
}));

jest.mock("fs", () => ({
  promises: { writeFile: jest.fn(), unlink: jest.fn() },
  createReadStream: jest.fn(),
}));

const MockOpenAI = OpenAI as unknown as jest.Mock;

const schema = z.object({ category: z.string(), confidence: z.number() });

const requests: BatchRequest<ContentPart[]>[] = [
  {
    customId: "sku-1",
    input: [{ type: "text", text: "Tag this product: 16in barrel" }],
    systemPrompt: "You tag products.",
  },
];

function writtenLines(): any[] {
  const fs = require("fs");
  return fs.promises.writeFile.mock.calls[0][1]
    .split("\n")
    .map((line: string) => JSON.parse(line));
}

describe("OtiumLanguageModel", () => {
  const savedOtiumKey = process.env.OTIUM_API_KEY;
  const savedOpenAIKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OTIUM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const fs = require("fs");
    fs.promises.writeFile.mockResolvedValue(undefined);
    fs.promises.unlink.mockResolvedValue(undefined);
    fs.createReadStream.mockReturnValue("mock-stream");
    mockFileCreate.mockResolvedValue({ id: "file-in" });
    mockBatchCreate.mockResolvedValue({ id: "batch_1", status: "validating" });
  });

  afterAll(() => {
    if (savedOtiumKey !== undefined) process.env.OTIUM_API_KEY = savedOtiumKey;
    if (savedOpenAIKey !== undefined) process.env.OPENAI_API_KEY = savedOpenAIKey;
  });

  describe("client", () => {
    it("points the OpenAI client at Otium's API host", () => {
      const model = new OtiumLanguageModel("otium-small", {
        apiKey: "sk-otium-test",
      });
      expect(model.provider).toBe("otium");
      expect(model.modelId).toBe("otium-small");
      expect(MockOpenAI).toHaveBeenCalledWith({
        apiKey: "sk-otium-test",
        baseURL: "https://api.getotium.ai/v1",
      });
      expect(OTIUM_BASE_URL).toBe("https://api.getotium.ai/v1");
    });

    it("reads the key from OTIUM_API_KEY, never OPENAI_API_KEY", () => {
      process.env.OTIUM_API_KEY = "sk-otium-env";
      process.env.OPENAI_API_KEY = "sk-openai";
      new OtiumLanguageModel("otium-small");
      expect(MockOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-otium-env" })
      );
    });

    it("takes a base URL override, e.g. a gateway in front of Otium", () => {
      new OtiumLanguageModel("otium-small", {
        baseURL: "https://gw.example.com/v1",
      });
      expect(MockOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: "https://gw.example.com/v1" })
      );
    });

    it("is what the otium() factory returns", () => {
      expect(otium("otium-medium")).toBeInstanceOf(OtiumLanguageModel);
    });
  });

  describe("createBatch", () => {
    it("writes OpenAI batch lines for the Otium model, with a JSON schema", async () => {
      const model = new OtiumLanguageModel("otium-small");
      await expect(model.createBatch(requests, schema)).resolves.toBe(
        "batch_1"
      );

      const [line] = writtenLines();
      expect(line).toMatchObject({
        custom_id: "sku-1",
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: "otium-small",
          messages: [
            { role: "system", content: "You tag products." },
            {
              role: "user",
              content: [
                { type: "text", text: "Tag this product: 16in barrel" },
              ],
            },
          ],
          response_format: { type: "json_schema" },
        },
      });
      expect(
        Object.keys(line.body.response_format.json_schema.schema.properties)
      ).toEqual(["category", "confidence"]);
      expect(mockFileCreate).toHaveBeenCalledWith({
        file: "mock-stream",
        purpose: "batch",
      });
    });

    it.each([
      [undefined, "24h"],
      ["24h", "24h"],
      ["7d", "7d"],
    ] as const)("completionWindow %s is sent as %s", async (window, sent) => {
      const model = new OtiumLanguageModel("otium-small", {
        completionWindow: window,
      });
      await model.createBatch(requests, schema);
      expect(mockBatchCreate).toHaveBeenCalledWith({
        input_file_id: "file-in",
        endpoint: "/v1/chat/completions",
        completion_window: sent,
      });
    });

    it("wraps an API error in a BatchError", async () => {
      mockBatchCreate.mockRejectedValueOnce(new Error("insufficient funds"));
      const model = new OtiumLanguageModel("otium-small");
      await expect(model.createBatch(requests, schema)).rejects.toMatchObject({
        name: "BatchError",
        code: "batch_creation_failed",
        message: "insufficient funds",
      });
    });
  });

  describe("getBatch", () => {
    it.each([
      ["validating", "validating"],
      ["in_progress", "in_progress"],
      ["finalizing", "in_progress"],
      ["completed", "completed"],
      ["expired", "expired"],
      ["cancelled", "cancelled"],
    ])("maps Otium status %s to %s", async (status, mapped) => {
      mockBatchRetrieve.mockResolvedValueOnce({
        id: "batch_1",
        status,
        request_counts: { total: 3, completed: 1, failed: 0 },
        created_at: 1792540800,
      });
      const batch = await new OtiumLanguageModel("otium-small").getBatch(
        "batch_1"
      );
      expect(batch.status).toBe(mapped);
      expect(batch.requestCounts).toEqual({ total: 3, completed: 1, failed: 0 });
      expect(batch.createdAt).toEqual(new Date(1792540800 * 1000));
    });
  });

  describe("getBatchResults", () => {
    it("parses Otium's output file into typed results with usage", async () => {
      mockBatchRetrieve.mockResolvedValueOnce({
        id: "batch_1",
        status: "completed",
        output_file_id: "file-out",
      });
      // An Otium output line: the OpenAI shape, naming the model that served it.
      const body = {
        id: "chatcmpl-1",
        object: "chat.completion",
        model: "gemma-4-12b-qat-w4a16",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: '{"category":"barrel","confidence":0.97}',
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 12,
          total_tokens: 52,
          prompt_tokens_details: { cached_tokens: 32 },
        },
      };
      mockContent.mockResolvedValueOnce({
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: "batch_req_1",
              custom_id: "sku-1",
              response: { status_code: 200, body },
              error: null,
            }) + "\n"
          ),
      });

      const results = await new OtiumLanguageModel(
        "otium-small"
      ).getBatchResults<z.infer<typeof schema>>("batch_1");

      expect(mockContent).toHaveBeenCalledWith("file-out");
      expect(results).toEqual([
        {
          customId: "sku-1",
          output: { category: "barrel", confidence: 0.97 },
          usage: { promptTokens: 40, completionTokens: 12, totalTokens: 52 },
          error: undefined,
        },
      ]);
    });

    it("refuses before the output file exists", async () => {
      mockBatchRetrieve.mockResolvedValueOnce({
        id: "batch_1",
        status: "in_progress",
      });
      await expect(
        new OtiumLanguageModel("otium-small").getBatchResults("batch_1")
      ).rejects.toThrow(BatchError);
    });
  });
});
