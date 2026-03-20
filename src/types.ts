import type {
  AgentPlan,
  FinalResponse,
  PlannedChange,
  TaskStatus,
  ValidationResult,
} from "./schemas/index.js";

export type AgentMode = "ask" | "plan" | "edit" | "exec" | "review";

export type ToolRisk = "safe" | "guarded" | "restricted";

export interface CommandValidation {
  valid: boolean;
  risk: ToolRisk;
  reason?: string;
}

export type { TaskStatus, ValidationResult };

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

export type { AgentPlan, PlannedChange };

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

export type { FinalResponse };

export interface MemoryEntry {
  content: string;
  createdAt: string;
  source?: string;
}

export interface MemoryStore {
  lessons: MemoryEntry[];
  preferences: MemoryEntry[];
  conventions: MemoryEntry[];
}

export interface CompactedHistory {
  summary: string;
  recentTurns: SessionTurn[];
  originalTurnCount: number;
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

// MCP tool definitions passed to LLM providers for native tool calling
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  server: string;
}

// Tool call returned by an LLM provider requesting execution
export interface ProviderToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// A message in the conversation history sent to the provider
export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ProviderToolCall[];
  toolResults?: Array<{
    toolCallId: string;
    content: string;
    isError?: boolean;
  }>;
}

export interface AgentRunOptions {
  cwd: string;
  mode: AgentMode;
  prompt: string;
  command?: string;
  patch?: {
    path: string;
    search: string;
    replace: string;
  };
  multiPatch?: Array<{
    type: "create" | "replace" | "delete";
    path: string;
    content?: string;
    search?: string;
    replace?: string;
    reason: string;
  }>;
  autoApprove?: boolean;
  requestApproval?: (prompt: string) => Promise<boolean>;
  history?: ProviderMessage[];
  onChunk?: (text: string, type: "thinking" | "content") => void;
  memoryContext?: string;
  yolo?: boolean;
  doubleCheck?: boolean;
  provider?: string;
  model?: string;
}
