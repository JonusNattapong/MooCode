import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "../config.js";
import {
  AgentPlanSchema,
  SchemaValidationError,
  validateWithSchema,
} from "../schemas/index.js";
import type {
  AgentPlan,
  McpToolDefinition,
  ProviderMessage,
  ProviderToolCall,
  RepoMetadata,
  WorkingSet,
} from "../types.js";
import { buildAskPrompt, buildPlanPrompt } from "./prompts.js";
import type {
  AskWithToolsResult,
  ChatMessage,
  Provider,
  StreamChunkType,
} from "./provider.js";

export class AnthropicProvider implements Provider {
  readonly name = "anthropic";
  private readonly client: Anthropic | null;

  constructor(private readonly apiKey = process.env.ANTHROPIC_API_KEY) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async ask(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    history?: ChatMessage[],
    memoryContext?: string,
  ): Promise<string> {
    if (!this.client) {
      return this.fallbackAsk(prompt, repo, workingSet);
    }

    const { system, messages } = buildAskPrompt(
      prompt,
      repo,
      workingSet,
      history,
      undefined,
      memoryContext,
    );

    try {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        system,
        messages,
      });

      return response.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
    } catch (error) {
      console.error(
        `Anthropic ask error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.fallbackAsk(prompt, repo, workingSet);
    }
  }

  async askStream(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    onChunk: (text: string, type: StreamChunkType) => void,
    history?: ChatMessage[],
    memoryContext?: string,
  ): Promise<string> {
    if (!this.client) {
      const text = this.fallbackAsk(prompt, repo, workingSet);
      onChunk(text, "content");
      return text;
    }

    const { system, messages } = buildAskPrompt(
      prompt,
      repo,
      workingSet,
      history,
      undefined,
      memoryContext,
    );

    try {
      const stream = this.client.messages.stream({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        system,
        messages,
      });

      let fullText = "";
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            if (chunk) {
              fullText += chunk;
              onChunk(chunk, "content");
            }
          } else if (event.delta.type === "thinking_delta") {
            const chunk = (event.delta as { thinking?: string }).thinking;
            if (chunk) {
              onChunk(chunk, "thinking");
            }
          }
        }
      }

      return (
        fullText ||
        (await stream.finalMessage()).content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n")
      );
    } catch (error) {
      console.error(
        `Anthropic stream error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const text = this.fallbackAsk(prompt, repo, workingSet);
      onChunk(text, "content");
      return text;
    }
  }

  async createPlan(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    memoryContext?: string,
  ): Promise<AgentPlan> {
    if (!this.client) {
      return this.fallbackPlan(prompt, repo, workingSet);
    }

    const { system, user } = buildPlanPrompt(
      prompt,
      repo,
      workingSet,
      undefined,
      memoryContext,
    );

    const response = await this.client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    try {
      const parsed = JSON.parse(text);
      const validated = validateWithSchema(
        AgentPlanSchema,
        parsed,
        "model plan output",
      );
      return validated;
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        console.warn(`Plan validation failed: ${error.format()}`);
      }
      return this.fallbackPlan(prompt, repo, workingSet);
    }
  }

  private fallbackAsk(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
  ): string {
    const lines = [
      `**No API key configured — showing local analysis.**`,
      ``,
      `Repository: ${repo.rootPath}`,
      `Languages: ${repo.detectedLanguages.join(", ") || "unknown"}`,
      `Package manager: ${repo.packageManager ?? "none"}`,
    ];

    if (workingSet.files.length > 0) {
      lines.push("", "Relevant files:");
      for (const f of workingSet.files) {
        lines.push(`  - ${f.path} (${f.reason})`);
      }
    } else {
      lines.push(
        "",
        "No files matched your question. Try rephrasing or run /init first.",
      );
    }

    lines.push("", "Set ANTHROPIC_API_KEY to enable full AI responses.");
    return lines.join("\n");
  }

  private fallbackPlan(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
  ): AgentPlan {
    return {
      summary: `Heuristic plan for: ${prompt}`,
      filesToInspect: workingSet.files.map((file) => file.path),
      filesToChange: workingSet.files.slice(0, 3).map((file) => ({
        path: file.path,
        reason: file.reason,
      })),
      validation: repo.packageManager === "npm" ? ["npm run check"] : [],
      risk: workingSet.files.length > 4 ? "medium" : "low",
    };
  }

  async askWithTools(
    messages: ProviderMessage[],
    repo: RepoMetadata,
    workingSet: WorkingSet,
    tools: McpToolDefinition[],
  ): Promise<AskWithToolsResult> {
    if (!this.client) {
      const text = this.fallbackAsk(
        messages[messages.length - 1]?.content ?? "",
        repo,
        workingSet,
      );
      return { text, toolCalls: [] };
    }

    const systemPrompt = [
      "You are a helpful coding assistant analyzing a local codebase.",
      "You have access to external MCP tools. Use them when they help answer the question.",
      "Be concise and specific. Reference file paths and code when relevant.",
    ].join("\n");

    const anthropicTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        properties:
          (tool.inputSchema.properties as Record<string, unknown>) ?? {},
        required: (tool.inputSchema.required as string[]) ?? [],
      },
    }));

    const anthropicMessages = this.toAnthropicMessages(messages);

    try {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      const textParts: string[] = [];
      const toolCalls: ProviderToolCall[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            args: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        text: textParts.join("\n"),
        toolCalls,
      };
    } catch (error) {
      console.error(
        `Anthropic askWithTools error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const text = this.fallbackAsk(
        messages[messages.length - 1]?.content ?? "",
        repo,
        workingSet,
      );
      return { text, toolCalls: [] };
    }
  }

  private toAnthropicMessages(
    messages: ProviderMessage[],
  ): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message that made tool calls
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args,
          });
        }
        result.push({ role: "assistant", content });
      } else if (msg.toolResults && msg.toolResults.length > 0) {
        // User message containing tool results
        const content: Anthropic.ContentBlockParam[] = msg.toolResults.map(
          (tr) => ({
            type: "tool_result",
            tool_use_id: tr.toolCallId,
            content: tr.content,
            is_error: tr.isError,
          }),
        );
        result.push({ role: "user", content });
      } else {
        // Plain text message
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }
}
