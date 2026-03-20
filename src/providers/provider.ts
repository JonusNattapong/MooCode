import type {
  AgentPlan,
  McpToolDefinition,
  ProviderMessage,
  ProviderToolCall,
  RepoMetadata,
  WorkingSet,
} from "../types.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type StreamChunkType = "thinking" | "content";

export interface AskWithToolsResult {
  text: string;
  toolCalls: ProviderToolCall[];
}

export interface Provider {
  readonly name: string;
  isConfigured(): boolean;
  createPlan(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    memoryContext?: string,
  ): Promise<AgentPlan>;
  ask(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    history?: ChatMessage[],
    memoryContext?: string,
  ): Promise<string>;
  askStream(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    onChunk: (text: string, type: StreamChunkType) => void,
    history?: ChatMessage[],
    memoryContext?: string,
  ): Promise<string>;

  /**
   * Multi-turn ask with native tool calling support.
   * Returns text + any tool calls the LLM wants to execute.
   * Callers should execute tool calls and feed results back via messages.
   */
  askWithTools(
    messages: ProviderMessage[],
    repo: RepoMetadata,
    workingSet: WorkingSet,
    tools: McpToolDefinition[],
  ): Promise<AskWithToolsResult>;
}
