import { z } from "zod";

// Schema for PlannedChange
export const PlannedChangeSchema = z.object({
  path: z.string().min(1, "Path is required"),
  reason: z.string().min(1, "Reason is required")
});

// Schema for AgentPlan
export const AgentPlanSchema = z.object({
  summary: z.string().min(1, "Summary is required"),
  filesToInspect: z.array(z.string()).min(1, "At least one file to inspect is required"),
  filesToChange: z.array(PlannedChangeSchema),
  validation: z.array(z.string()),
  risk: z.enum(["low", "medium", "high"])
});

// Schema for validation result
export const ValidationResultSchema = z.object({
  command: z.string(),
  ok: z.boolean(),
  output: z.string()
});

// Schema for FinalResponse
export const FinalResponseSchema = z.object({
  status: z.enum([
    "answered",
    "planned",
    "patch_proposed",
    "applied_not_validated",
    "validated_success",
    "validated_failed",
    "blocked_by_policy",
    "failed"
  ]),
  summary: z.string().min(1, "Summary is required"),
  plan: AgentPlanSchema.optional(),
  changedFiles: z.array(z.string()).optional(),
  validation: z.array(ValidationResultSchema).optional(),
  risks: z.array(z.string()).optional()
});

// Type exports inferred from schemas
export type ValidatedAgentPlan = z.infer<typeof AgentPlanSchema>;
export type ValidatedFinalResponse = z.infer<typeof FinalResponseSchema>;
export type ValidatedPlannedChange = z.infer<typeof PlannedChangeSchema>;
export type ValidatedValidationResult = z.infer<typeof ValidationResultSchema>;

// Validation error class
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly receivedData: unknown
  ) {
    super(message);
    this.name = "SchemaValidationError";
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
  context: string
): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    throw new SchemaValidationError(
      `Invalid ${context}: ${result.error.issues.length} validation error(s)`,
      result.error.issues,
      data
    );
  }
  
  return result.data;
}