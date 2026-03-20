import { z } from "zod";

// Schema for PlannedChange
export const PlannedChangeSchema = z.object({
  path: z.string().min(1, "Path is required"),
  reason: z.string().min(1, "Reason is required"),
});

// Schema for AgentPlan
export const AgentPlanSchema = z.object({
  summary: z.string().min(1, "Summary is required"),
  filesToInspect: z.array(z.string()), // Removed .min(1)
  filesToChange: z.array(PlannedChangeSchema),
  validation: z.array(z.string()),
  risk: z.enum(["low", "medium", "high"]),
});

// Schema for validation result
export const ValidationResultSchema = z.object({
  command: z.string(),
  ok: z.boolean(),
  output: z.string().optional(), // Made optional
});

// TaskStatus type for consistency with types.ts
export const TaskStatusSchema = z.enum([
  "answered",
  "planned",
  "patch_proposed",
  "applied_not_validated",
  "validated_success",
  "validated_failed",
  "blocked_by_policy",
  "failed",
]);

// Schema for FinalResponse
export const FinalResponseSchema = z.object({
  status: TaskStatusSchema,
  summary: z.string().min(1, "Summary is required"),
  plan: AgentPlanSchema.optional(),
  changedFiles: z.array(z.string()).optional(),
  validation: z.array(ValidationResultSchema).optional(),
  risks: z.array(z.string()).optional(),
});

// Type exports inferred from schemas (Source of Truth)
export type PlannedChange = z.infer<typeof PlannedChangeSchema>;
export type AgentPlan = z.infer<typeof AgentPlanSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type FinalResponse = z.infer<typeof FinalResponseSchema>;

// Validation error class with sanitization
export class SchemaValidationError extends Error {
  public readonly sanitizedData: unknown;

  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    receivedData: unknown,
  ) {
    super(message);
    this.name = "SchemaValidationError";
    this.sanitizedData = this.sanitize(receivedData);
  }

  private sanitize(data: unknown): unknown {
    if (data === null || typeof data !== "object") return data;

    // For objects, return a summary to avoid leaking secrets or large content
    const keys = Object.keys(data as object);
    if (keys.length > 10) {
      return {
        _info: `Object with ${keys.length} keys`,
        keys: keys.slice(0, 10).concat("..."),
      };
    }

    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const val = (data as Record<string, unknown>)[key];
      if (typeof val === "string" && val.length > 100) {
        result[key] = `${val.slice(0, 50)}... (${val.length} chars)`;
      } else if (typeof val === "object" && val !== null) {
        result[key] = "[Object]";
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  format(): string {
    const issueMessages = this.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return `  - ${path ? `${path}: ` : ""}${issue.message}`;
      })
      .join("\n");
    return `Schema validation failed:\n${issueMessages}`;
  }
}

// Validation helper function
export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string,
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new SchemaValidationError(
      `Invalid ${context}: ${result.error.issues.length} validation error(s)`,
      result.error.issues,
      data,
    );
  }

  return result.data;
}
