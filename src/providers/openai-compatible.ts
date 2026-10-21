import { OpenAI } from "openai";
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
import { zodResponseFormat } from "openai/helpers/zod";

export interface OpenAICompatibleClientOptions {
  apiKey?: string;
  /** The API root, e.g. "https://api.example.com/v1". Omit for OpenAI itself. */
  baseURL?: string;
  /** Sent as the batch's `completion_window`. */
  completionWindow: string;
}

/**
 * The batch flow shared by every provider that implements OpenAI's Files and
 * Batch APIs: write a JSONL file, upload it, create the batch, poll it, and
 * read the output file. A provider supplies its name and client options.
 */
export abstract class OpenAICompatibleLanguageModel extends LanguageModel<
  Array<ContentPart>
> {
  protected client: OpenAI;
  private readonly completionWindow: string;

  constructor(
    modelId: string,
    config: LanguageModelConfig | undefined,
    options: OpenAICompatibleClientOptions
  ) {
    super(modelId, config);
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.completionWindow = options.completionWindow;
  }

  private async createJsonlFile(
    requests: BatchRequest<Array<ContentPart>>[],
    outputSchema: z.ZodSchema<any>
  ): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `batch-${Date.now()}.jsonl`);

    const jsonlContent = requests
      .map((request) => {
        const messages = [];
        if (request.systemPrompt) {
          messages.push({ role: "system", content: request.systemPrompt });
        }
        messages.push({ role: "user", content: request.input });
        return JSON.stringify({
          custom_id: request.customId,
          method: "POST",
          url: "/v1/chat/completions",
          body: {
            model: this.modelId,
            messages,
            response_format: zodResponseFormat(
              outputSchema,
              "structured_output"
            ),
          },
        });
      })
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
      const fileStream = fs.createReadStream(jsonlFile);
      const file = await this.client.files.create({
        file: fileStream,
        purpose: "batch",
      });

      // Create batch
      const batch = await this.client.batches.create({
        input_file_id: file.id,
        endpoint: "/v1/chat/completions",
        // OpenAI's types allow only "24h"; other providers accept more.
        completion_window: this.completionWindow as "24h",
      });

      // Cleanup temp file
      await fs.promises.unlink(jsonlFile);

      return batch.id;
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : "Unknown error",
        "batch_creation_failed"
      );
    }
  }

  async getBatch(batchId: string): Promise<Batch> {
    try {
      const batch = await this.client.batches.retrieve(batchId);

      return {
        id: batch.id,
        status: this.mapStatus(batch.status),
        requestCounts: {
          total: batch.request_counts?.total ?? 0,
          completed: batch.request_counts?.completed ?? 0,
          failed: batch.request_counts?.failed ?? 0,
        },
        createdAt: new Date(batch.created_at * 1000),
        completedAt: batch.completed_at
          ? new Date(batch.completed_at * 1000)
          : undefined,
        expiresAt: batch.expires_at
          ? new Date(batch.expires_at * 1000)
          : undefined,
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
      const batch = await this.client.batches.retrieve(batchId);

      if (!batch.output_file_id) {
        throw new BatchError(
          "Batch results not yet available",
          "results_not_ready",
          batchId
        );
      }

      const fileContent = await this.client.files.content(batch.output_file_id);
      const results = await fileContent.text();

      return results
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const result = JSON.parse(line);
          return {
            customId: result.custom_id,
            output: JSON.parse(
              result.response?.body?.choices?.[0]?.message?.content
            ) as TOutput,
            usage: result.response?.body?.usage
              ? {
                  promptTokens: result.response.body.usage.prompt_tokens,
                  completionTokens:
                    result.response.body.usage.completion_tokens,
                  totalTokens: result.response.body.usage.total_tokens,
                }
              : undefined,
            error: result.error
              ? {
                  code: result.error.code || "unknown_error",
                  message: result.error.message || "Unknown error occurred",
                }
              : undefined,
          };
        });
    } catch (error) {
      throw new BatchError(
        error instanceof Error ? error.message : "Unknown error",
        "results_retrieval_failed",
        batchId
      );
    }
  }

  async cancelBatch(batchId: string): Promise<void> {
    try {
      await this.client.batches.cancel(batchId);
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
      case "validating":
        return "validating";
      case "in_progress":
      // Every request has finished and the output file is being written.
      // Reporting it as failed would make a poller give up on a good batch.
      case "finalizing":
        return "in_progress";
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "expired":
        return "expired";
      case "cancelling":
        return "cancelling";
      case "cancelled":
        return "cancelled";
      default:
        return "failed";
    }
  }
}
