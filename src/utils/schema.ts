import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// zod 4 schemas carry a `_zod` internal marker and zod 4 ships a native
// JSON-schema converter; zod 3 schemas go through zod-to-json-schema.
export function toJsonSchema(
  schema: z.ZodSchema<any>
): Record<string, unknown> {
  const zodNamespace = z as unknown as {
    toJSONSchema?: (schema: unknown) => Record<string, unknown>;
  };
  if (
    typeof zodNamespace.toJSONSchema === "function" &&
    "_zod" in (schema as object)
  ) {
    return zodNamespace.toJSONSchema(schema);
  }
  return zodToJsonSchema(schema as any) as Record<string, unknown>;
}
