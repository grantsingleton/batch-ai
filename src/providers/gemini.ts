import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import {
  BatchError,
  BatchRequest,
  BatchResponse,
  Batch,
  LanguageModel,
  LanguageModelConfig,
  BatchStatus,
  ContentPart,
} from "../types.js";
import { toJsonSchema } from "../utils/schema.js";

const TERMINAL_STATES = new Set([
  "JOB_STATE_SUCCEEDED",
  "JOB_STATE_FAILED",
  "JOB_STATE_CANCELLED",
  "JOB_STATE_EXPIRED",
]);

export class GeminiLanguageModel extends LanguageModel<Array<ContentPart>> {
  public readonly provider = "google" as const;
  private client: GoogleGenAI;

  constructor(modelId: string, config?: LanguageModelConfig) {
    super(modelId, config);
    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || config?.apiKey,
    });
  }

  private convertContentParts(parts: ContentPart[]): Array<{ text: string }> {
    return parts.map((part) => {
      if (part.type === "text") {
        return { text: part.text || "" };
      }
      // The Gemini API does not fetch arbitrary web URLs; images would need
      // to be inlined as base64 or uploaded via the Files API first.
      throw new Error(
        `Content part type '${part.type}' is not supported by the Gemini provider yet (text only)`
      );
    });
  }

  private async createJsonlFile(
    requests: BatchRequest<Array<ContentPart>>[],
    outputSchema: z.ZodSchema<any>
  ): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `batch-${Date.now()}.jsonl`);

    const jsonSchema = toJsonSchema(outputSchema);

    const jsonlContent = requests
      .map((request) =>
        JSON.stringify({
          key: request.customId,
          request: {
            contents: [
              {
                role: "user",
                parts: this.convertContentParts(request.input),
              },
            ],
            ...(request.systemPrompt
              ? {
                  system_instruction: {
                    parts: [{ text: request.systemPrompt }],
                  },
                }
              : {}),
            generation_config: {
              response_mime_type: "application/json",
              response_json_schema: jsonSchema,
            },
          },
        })
      )
      .join("\n");

    await fs.promises.writeFile(tempFile, jsonlContent);
    return tempFile;
  }

  async createBatch(
    requests: BatchRequest<Array<ContentPart>>[],
    outputSchema: z.ZodSchema<unknown>
  ): Promise<string> {
    try {
      // Create JSONL file
      const jsonlFile = await this.createJsonlFile(requests, outputSchema);

      // Upload file
      const file = await this.client.files.upload({
        file: jsonlFile,
        config: { mimeType: "jsonl" },
      });

      // Create batch
      const batch = await this.client.batches.create({
        model: this.modelId,
        src: file.name as string,
        config: {
          displayName: `batch-ai-${Date.now()}`,
        },
      });

      // Cleanup temp file
      await fs.promises.unlink(jsonlFile);

      if (!batch.name) {
        throw new Error("Gemini did not return a batch job name");
      }

      return batch.name;
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : "Unknown error",
        "batch_creation_failed"
      );
    }
  }

  async getBatch(batchId: string): Promise<Batch> {
    try {
      const batch = await this.client.batches.get({ name: batchId });

      return {
        id: batch.name ?? batchId,
        status: this.mapStatus(batch.state as string),
        // The Gemini batch job resource does not expose per-request counts
        requestCounts: {
          total: 0,
          completed: 0,
          failed: 0,
        },
        createdAt: batch.createTime ? new Date(batch.createTime) : new Date(),
        completedAt: batch.endTime ? new Date(batch.endTime) : undefined,
      };
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : "Unknown error",
        "batch_retrieval_failed",
        batchId
      );
    }
  }

  async getBatchResults<TOutput = unknown>(
    batchId: string
  ): Promise<BatchResponse<TOutput>[]> {
    try {
      const batch = await this.client.batches.get({ name: batchId });
      const state = batch.state as string;

      if (!TERMINAL_STATES.has(state)) {
        throw new BatchError(
          "Batch results not yet available",
          "results_not_ready",
          batchId
        );
      }

      if (state !== "JOB_STATE_SUCCEEDED") {
        throw new BatchError(
          `Batch ended in state ${state}`,
          "results_retrieval_failed",
          batchId
        );
      }

      const resultFileName = batch.dest?.fileName;
      if (!resultFileName) {
        throw new BatchError(
          "Batch results file not available",
          "results_retrieval_failed",
          batchId
        );
      }

      const downloadPath = path.join(
        os.tmpdir(),
        `batch-results-${Date.now()}.jsonl`
      );
      await this.client.files.download({
        file: resultFileName,
        downloadPath,
      });
      const fileContent = await fs.promises.readFile(downloadPath, "utf-8");
      await fs.promises.unlink(downloadPath);

      return fileContent
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const result = JSON.parse(line);
          const customId = result.key;

          if (result.error) {
            return {
              customId,
              error: {
                code: String(result.error.code ?? "unknown_error"),
                message: result.error.message || "Unknown error occurred",
              },
            };
          }

          const usageMetadata = result.response?.usageMetadata;
          const usage = usageMetadata
            ? {
                promptTokens: usageMetadata.promptTokenCount ?? 0,
                completionTokens: usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: usageMetadata.totalTokenCount ?? 0,
              }
            : undefined;

          const text =
            result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

          try {
            return {
              customId,
              output: JSON.parse(text) as TOutput,
              usage,
            };
          } catch {
            return {
              customId,
              usage,
              error: {
                code: "output_parse_failed",
                message: "Failed to parse model output as JSON",
              },
            };
          }
        });
    } catch (error) {
      if (error instanceof BatchError) {
        throw error;
      }
      throw new BatchError(
        error instanceof Error ? error.message : "Unknown error",
        "results_retrieval_failed",
        batchId
      );
    }
  }

  async cancelBatch(batchId: string): Promise<void> {
    try {
      await this.client.batches.cancel({ name: batchId });
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : "Unknown error",
        "batch_cancellation_failed",
        batchId
      );
    }
  }

  private mapStatus(status: string): BatchStatus {
    switch (status) {
      case "JOB_STATE_PENDING":
        return "validating";
      case "JOB_STATE_RUNNING":
        return "in_progress";
      case "JOB_STATE_SUCCEEDED":
        return "completed";
      case "JOB_STATE_FAILED":
        return "failed";
      case "JOB_STATE_EXPIRED":
        return "expired";
      case "JOB_STATE_CANCELLED":
        return "cancelled";
      default:
        return "failed";
    }
  }
}
