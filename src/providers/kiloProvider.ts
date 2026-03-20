import { PROVIDER_DEFAULTS } from "../config.js";
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

interface KiloMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface KiloResponse {
  id: string;
  choices?: Array<{ message: { content: string } }>;
  content?: string;
  model: string;
}

export class KiloProvider implements Provider {
  readonly name = "kilo";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.KILO_API_KEY ?? null;
    this.baseUrl =
      process.env.KILO_BASE_URL ?? "https://api.kilo.ai/api/gateway";
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  async ask(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    history?: ChatMessage[],
    memoryContext?: string,
  ): Promise<string> {
    if (!this.apiKey) {
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: PROVIDER_DEFAULTS.kilo,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        if (response.status === 402) {
          const errBody = (await response.json().catch(() => null)) as {
            error?: { message?: string; buyCreditsUrl?: string };
          } | null;
          const msg = errBody?.error?.message ?? "Credits required";
          const url =
            errBody?.error?.buyCreditsUrl ?? "https://app.kilo.ai/profile";
          throw new Error(`Kilo: ${msg}\n  Add credits at ${url}`);
        }
        throw new Error(
          `Kilo API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as KiloResponse;
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      }
      return data.content ?? "No response from model.";
    } catch (error) {
      console.error(
        `Kilo ask error: ${error instanceof Error ? error.message : String(error)}`,
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
    if (!this.apiKey) {
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: PROVIDER_DEFAULTS.kilo,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: 2048,
          stream: true,
        }),
      });

      if (!response.ok) {
        if (response.status === 402) {
          const errBody = (await response.json().catch(() => null)) as {
            error?: { message?: string; buyCreditsUrl?: string };
          } | null;
          const msg = errBody?.error?.message ?? "Credits required";
          const url =
            errBody?.error?.buyCreditsUrl ?? "https://app.kilo.ai/profile";
          throw new Error(`Kilo: ${msg}\n  Add credits at ${url}`);
        }
        throw new Error(
          `Kilo API error: ${response.status} ${response.statusText}`,
        );
      }

      return await this.parseSSEStream(response, onChunk);
    } catch (error) {
      console.error(
        `Kilo stream error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const text = this.fallbackAsk(prompt, repo, workingSet);
      onChunk(text, "content");
      return text;
    }
  }

  private async parseSSEStream(
    response: Response,
    onChunk: (text: string, type: StreamChunkType) => void,
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed === "data: [DONE]") continue;

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    reasoning?: string | null;
                    reasoning_details?: Array<{ text?: string }>;
                  };
                  message?: { content?: string };
                }>;
              };
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;

              // Emit thinking/reasoning tokens
              if (delta?.reasoning) {
                onChunk(delta.reasoning, "thinking");
                continue;
              }
              if (
                delta?.reasoning_details &&
                delta.reasoning_details.length > 0
              ) {
                const thinkText = delta.reasoning_details
                  .map((d) => d.text ?? "")
                  .filter(Boolean)
                  .join("");
                if (thinkText) {
                  onChunk(thinkText, "thinking");
                }
                continue;
              }

              // Emit content tokens
              const content = delta?.content ?? choice.message?.content ?? "";
              if (content) {
                fullText += content;
                onChunk(content, "content");
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullText;
  }

  async createPlan(
    prompt: string,
    repo: RepoMetadata,
    workingSet: WorkingSet,
    memoryContext?: string,
  ): Promise<AgentPlan> {
    if (!this.apiKey) {
      return this.fallbackPlan(prompt, repo, workingSet);
    }

    const { system, user } = buildPlanPrompt(
      prompt,
      repo,
      workingSet,
      undefined,
      memoryContext,
    );

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: PROVIDER_DEFAULTS.kilo,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: 1200,
        }),
      });

      if (!response.ok) {
        if (response.status === 402) {
          const errBody = (await response.json().catch(() => null)) as {
            error?: { message?: string; buyCreditsUrl?: string };
          } | null;
          const msg = errBody?.error?.message ?? "Credits required";
          const url =
            errBody?.error?.buyCreditsUrl ?? "https://app.kilo.ai/profile";
          throw new Error(`Kilo: ${msg}\n  Add credits at ${url}`);
        }
        throw new Error(
          `Kilo API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as KiloResponse;

      // Handle OpenAI-compatible response format (choices array)
      if (data.choices && data.choices.length > 0) {
        const text = data.choices[0].message.content;
        try {
          const parsed = JSON.parse(text);
          const validated = validateWithSchema(
            AgentPlanSchema,
            parsed,
            "Kilo model plan output",
          );
          return validated;
        } catch (error) {
          if (error instanceof SchemaValidationError) {
            console.warn(`Kilo plan validation failed: ${error.format()}`);
          }
          return this.fallbackPlan(prompt, repo, workingSet);
        }
      }

      // Handle legacy content field
      const text = data.content;
      if (!text) {
        return this.fallbackPlan(prompt, repo, workingSet);
      }

      try {
        const parsed = JSON.parse(text);
        const validated = validateWithSchema(
          AgentPlanSchema,
          parsed,
          "Kilo model plan output",
        );
        return validated;
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          console.warn(`Kilo plan validation failed: ${error.format()}`);
        }
        return this.fallbackPlan(prompt, repo, workingSet);
      }
    } catch (error) {
      console.error(
        `Kilo provider error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.fallbackPlan(prompt, repo, workingSet);
    }
  }

  async askWithTools(
    messages: ProviderMessage[],
    repo: RepoMetadata,
    workingSet: WorkingSet,
    tools: McpToolDefinition[],
  ): Promise<AskWithToolsResult> {
    if (!this.apiKey) {
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

    const openaiTools = tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: tool.inputSchema.properties ?? {},
          required: (tool.inputSchema.required as string[]) ?? [],
        },
      },
    }));

    const openaiMessages = this.toOpenAIMessages(messages, systemPrompt);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: PROVIDER_DEFAULTS.kilo,
          messages: openaiMessages,
          tools: openaiTools,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        if (response.status === 402) {
          const errBody = (await response.json().catch(() => null)) as {
            error?: { message?: string; buyCreditsUrl?: string };
          } | null;
          const msg = errBody?.error?.message ?? "Credits required";
          const url =
            errBody?.error?.buyCreditsUrl ?? "https://app.kilo.ai/profile";
          throw new Error(`Kilo: ${msg}\n  Add credits at ${url}`);
        }
        throw new Error(
          `Kilo API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as KiloResponse & {
        choices?: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };

      const choice = data.choices?.[0];
      if (!choice) {
        return { text: "No response from model.", toolCalls: [] };
      }

      const text = choice.message.content ?? "";
      const toolCalls: ProviderToolCall[] = (
        choice.message.tool_calls ?? []
      ).map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // malformed arguments
        }
        return { id: tc.id, name: tc.function.name, args };
      });

      return { text, toolCalls };
    } catch (error) {
      console.error(
        `Kilo askWithTools error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const text = this.fallbackAsk(
        messages[messages.length - 1]?.content ?? "",
        repo,
        workingSet,
      );
      return { text, toolCalls: [] };
    }
  }

  private toOpenAIMessages(
    messages: ProviderMessage[],
    systemPrompt: string,
  ): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message with tool calls
        result.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        });
      } else if (msg.toolResults && msg.toolResults.length > 0) {
        // Tool result messages (one per tool call)
        for (const tr of msg.toolResults) {
          result.push({
            role: "tool",
            tool_call_id: tr.toolCallId,
            content: tr.content,
          });
        }
      } else {
        // Plain text message
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
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

    lines.push("", "Set KILO_API_KEY to enable full AI responses.");
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
}
