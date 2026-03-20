export type AgentMode = "ask" | "plan" | "edit" | "exec" | "review";

export type ToolRisk = "safe" | "guarded" | "restricted";

export interface CommandValidation {
  valid: boolean;
  risk: ToolRisk;
  reason?: string;
}

export type TaskStatus =
  | "answered"
  | "planned"
  | "patch_proposed"
  | "applied_not_validated"
  | "validated_success"
  | "validated_failed"
  | "blocked_by_policy"
  | "failed";

export interface RepoMetadata {
  rootPath: string;
  detectedLanguages: string[];
  packageManager: string | null;
  testFramework: string | null;
  lintConfig: string[];
  buildConfig: string[];
  importantFiles: string[];
}

export interface WorkingSetItem {
  path: string;
  reason: string;
  score: number;
  snippet?: string;
}

export interface WorkingSet {
  files: WorkingSetItem[];
}

export interface PlannedChange {
  path: string;
  reason: string;
}

export interface AgentPlan {
  summary: string;
  filesToInspect: string[];
  filesToChange: PlannedChange[];
  validation: string[];
  risk: "low" | "medium" | "high";
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  summary: string;
}

export interface SessionLog {
  id: string;
  createdAt: string;
  cwd: string;
  prompt: string;
  mode: AgentMode;
  toolCalls: ToolCallRecord[];
  notes: string[];
  status: TaskStatus;
}

export interface ToolContext {
  repoRoot: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  data: unknown;
}

export interface CommandResult<T = unknown> {
  ok: boolean;
  summary: string;
  data: T;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error?: string;
}

export interface ProposedPatch {
  path: string;
  before: string;
  after: string;
}

export type PatchOperationType = "create" | "replace" | "delete";

export interface PatchOperation {
  type: PatchOperationType;
  path: string;
  risk: ToolRisk;
  reason: string;
  before?: string;
  after?: string;
}

export interface MultiPatch {
  operations: PatchOperation[];
  summary: string;
}

export interface FinalResponse {
  status: TaskStatus;
  summary: string;
  plan?: AgentPlan;
  changedFiles?: string[];
  validation?: {
    command: string;
    ok: boolean;
    output: string;
  }[];
  risks?: string[];
}

export interface SessionTurn {
  input: string;
  mode: AgentMode;
  response: FinalResponse;
  timestamp: string;
}

export interface SessionContext {
  turns: SessionTurn[];
  allChangedFiles: string[];
  cwd: string;
}
