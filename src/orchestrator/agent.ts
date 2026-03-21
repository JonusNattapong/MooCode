import ora, { type Ora } from "ora";
import prompts from "prompts";
import { scanRepository } from "../context/repoScanner.js";
import { buildWorkingSet } from "../context/workingSet.js";
import { McpService } from "../mcp/service.js";
import { PluginService } from "../plugins/index.js";
import { SafetyGate } from "../policies/safetyGate.js";
import type {
  ChatMessage,
  Provider,
  StreamChunkType,
} from "../providers/index.js";
import {
  FinalResponseSchema,
  SchemaValidationError,
  validateWithSchema,
} from "../schemas/index.js";
import { SessionLogger } from "../session/logger.js";
import { createToolRegistry } from "../tools/index.js";
import type {
  AgentMode,
  AgentRunOptions,
  FinalResponse,
  McpToolDefinition,
  MultiPatch,
  ProposedPatch,
  ProviderMessage,
  ProviderToolCall,
  ToolResult,
} from "../types.js";
import { colorize, printDiff } from "../utils/output.js";

export class Agent {
  private approvalInProgress = false;
  private spinner: Ora | null = null;
  private readonly pluginService: PluginService;

  constructor(
    private readonly provider: Provider,
    pluginService?: PluginService,
  ) {
    this.pluginService = pluginService ?? new PluginService();
  }

  async run(options: AgentRunOptions): Promise<FinalResponse> {
    const logger = new SessionLogger(options.cwd, options.mode, options.prompt);
    const repo = await scanRepository(options.cwd);
    const workingSet = await buildWorkingSet(options.cwd, options.prompt);
    const safety = new SafetyGate(options.cwd);
    const tools = createToolRegistry({ repoRoot: options.cwd });

    // Run beforeRun hooks — plugins can inspect/modify the context
    const hookContext = await this.pluginService.runHooks("beforeRun", {
      mode: options.mode,
      prompt: options.prompt,
      cwd: options.cwd,
    });

    logger.note(
      `Detected languages: ${repo.detectedLanguages.join(", ") || "none"}`,
    );
    logger.note(`Working set size: ${workingSet.files.length}`);
    logger.note(`Using provider: ${this.provider.name}`);
    if (options.yolo) logger.note("YOLO mode active — extreme caution!");
    if (options.doubleCheck) logger.note("Double-check completion active");
    logger.addSelectedFiles(workingSet.files.map((f) => f.path));

    try {
      if (options.mode === "ask") {
        const mcpTools = await this.loadMcpTools(options.cwd);

        if (mcpTools.length > 0) {
          // Use MCP tool loop
          this.startSpinner("Thinking...");
          try {
            const answer = await this.askWithMcpTools(
              options.prompt,
              repo,
              workingSet,
              mcpTools,
              options.history,
              options.memoryContext,
              options.onChunk,
              Boolean(options.doubleCheck),
            );
            await logger.flush("answered");
            return this.validateFinalResponse({
              status: "answered",
              summary: answer,
            });
          } finally {
            this.stopSpinner();
          }
        }

        // No MCP tools — fall back to simple ask
        let answer: string;
        if (options.onChunk) {
          answer = await this.provider.askStream(
            options.prompt,
            repo,
            workingSet,
            options.onChunk,
            options.history,
            options.memoryContext,
          );
        } else {
          this.startSpinner("Thinking...");
          try {
            answer = await this.provider.ask(
              options.prompt,
              repo,
              workingSet,
              options.history,
              options.memoryContext,
            );
          } finally {
            this.stopSpinner();
          }
        }
        await logger.flush("answered");
        return this.validateFinalResponse({
          status: "answered",
          summary: answer,
        });
      }

      if (options.mode === "plan") {
        this.startSpinner("Creating plan...");
        try {
          const plan = await this.provider.createPlan(
            options.prompt,
            repo,
            workingSet,
            options.memoryContext,
          );
          await logger.flush("planned");
          return this.validateFinalResponse({
            status: "planned",
            summary: plan.summary,
            plan,
          });
        } finally {
          this.stopSpinner();
        }
      }

      if (options.mode === "exec") {
        if (!options.command) {
          throw new Error("Missing command for exec mode");
        }
        const validation = safety.validateCommand(options.command);
        if (!validation.valid) {
          throw new Error(
            validation.reason ?? `Command blocked: ${options.command}`,
          );
        }
        await this.assertApproval(
          `Run command "${options.command}"? (${validation.risk})`,
          options.autoApprove || options.yolo,
          options.requestApproval,
        );
        this.startSpinner(`Running: ${options.command}`);
        let result: ToolResult;
        try {
          result = await tools.runCommand(options.command);
        } finally {
          this.stopSpinner();
        }
        const output = result.data
          ? JSON.stringify(result.data, null, 2)
          : undefined;
        logger.addCommandOutput(options.command, result.ok, output ?? "");
        await logger.flush(
          result.ok ? "validated_success" : "validated_failed",
        );
        return this.validateFinalResponse({
          status: result.ok ? "validated_success" : "validated_failed",
          summary: result.summary,
          validation: [
            {
              command: options.command,
              ok: result.ok,
              output,
            },
          ],
        });
      }

      if (options.mode === "review") {
        const statusResult = await tools.gitStatus();
        const diffResult = await tools.gitDiff();
        const statusText = (statusResult.data as string) ?? "";
        const diffText = (diffResult.data as string) ?? "";

        if (!statusText && !diffText) {
          return this.validateFinalResponse({
            status: "answered",
            summary: "No uncommitted changes",
          });
        }

        const changedFiles = parseGitStatus(statusText);
        await logger.flush("answered");
        return this.validateFinalResponse({
          status: "answered",
          summary: `${changedFiles.length} file(s) with uncommitted changes`,
          changedFiles,
        });
      }

      if (options.mode === "edit") {
        if (options.multiPatch && options.multiPatch.length > 0) {
          // Validate all operations before applying
          const dirtyFiles: string[] = [];
          for (const op of options.multiPatch) {
            safety.validatePath(op.path);

            // For create ops, check if file already exists
            if (op.type === "create") {
              const existsResult = await tools
                .readFile(op.path)
                .catch(() => null);
              if (existsResult?.ok) {
                throw new Error(
                  `Cannot create ${op.path}: file already exists. Use "replace" instead.`,
                );
              }
            }

            // For replace/delete ops, check dirty status (skip if auto-approve is used)
            if (op.type === "replace" || op.type === "delete") {
              if (!(options.autoApprove || options.yolo)) {
                const dirtyResult = await tools.gitIsDirty(op.path);
                if ((dirtyResult.data as { isDirty: boolean }).isDirty) {
                  dirtyFiles.push(op.path);
                }
              }
            }
          }
          if (dirtyFiles.length > 0) {
            throw new Error(
              `Files have uncommitted changes and would be overwritten: ${dirtyFiles.join(", ")}`,
            );
          }

          const proposal = await tools.proposeMultiPatch(options.multiPatch);
          const data = proposal.data as {
            multiPatch: MultiPatch;
            diffs: string;
          };
          if (data.diffs) {
            printDiff(data.diffs);
          }
          await this.assertApproval(
            `Apply ${options.multiPatch.length} operations?`,
            options.autoApprove || options.yolo,
            options.requestApproval,
          );
          const applyResult = await tools.applyMultiPatch(data.multiPatch);
          const changedFiles = options.multiPatch.map((op) => op.path);
          await logger.flush("applied_not_validated");
          return this.validateFinalResponse({
            status: "applied_not_validated",
            summary: applyResult.summary,
            changedFiles,
          });
        }

        if (!options.patch) {
          throw new Error("Missing patch instructions for edit mode");
        }
        safety.validatePath(options.patch.path);

        // Check if file has uncommitted changes (skip if auto-approve is used)
        if (!(options.autoApprove || options.yolo)) {
          const dirtyResult = await tools.gitIsDirty(options.patch.path);
          if ((dirtyResult.data as { isDirty: boolean }).isDirty) {
            throw new Error(
              `File has uncommitted changes and would be overwritten: ${options.patch.path}`,
            );
          }
        }

        const proposal = await tools.proposeReplace(
          options.patch.path,
          options.patch.search,
          options.patch.replace,
        );
        const data = proposal.data as { patch: ProposedPatch; diff: string };
        printDiff(data.diff);
        await this.assertApproval(
          `Apply patch to ${options.patch.path}?`,
          options.autoApprove || options.yolo,
          options.requestApproval,
        );
        const applyResult = await tools.applyPatch(data.patch);
        await logger.flush("applied_not_validated");
        return this.validateFinalResponse({
          status: "applied_not_validated",
          summary: applyResult.summary,
          changedFiles: [options.patch.path],
        });
      }

      throw new Error(`Unsupported mode: ${options.mode satisfies never}`);
    } catch (error) {
      logger.error(error);
      await logger.flush("failed");
      return this.validateFinalResponse({
        status: "failed",
        summary: error instanceof Error ? error.message : String(error),
        risks: ["Task terminated before completion"],
      });
    } finally {
      // Run afterRun hooks — plugins can observe the outcome
      await this.pluginService.runHooks("afterRun", {
        mode: options.mode,
        prompt: options.prompt,
        cwd: options.cwd,
        hookContext,
      });
    }
  }

  private validateFinalResponse(response: FinalResponse): FinalResponse {
    try {
      return validateWithSchema(
        FinalResponseSchema,
        response,
        "final response",
      );
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        console.warn(`Final response validation warning: ${error.format()}`);
      }
      return response;
    }
  }

  private async assertApproval(
    prompt: string,
    autoApprove = false,
    requestApproval?: (prompt: string) => Promise<boolean>,
  ): Promise<void> {
    if (autoApprove) {
      return;
    }
    if (requestApproval) {
      const approved = await requestApproval(prompt);
      if (!approved) {
        throw new Error("Blocked by approval policy");
      }
      return;
    }
    // Guard against concurrent readline calls on the same stdin
    if (this.approvalInProgress) {
      throw new Error("Approval already in progress");
    }
    this.approvalInProgress = true;
    try {
      this.stopSpinner(); // Always stop spinner before asking for approval

      const response = await prompts({
        type: "confirm",
        name: "value",
        message: colorize(prompt, "yellow"),
        initial: true,
      });

      if (!response.value) {
        throw new Error("Blocked by approval policy");
      }
    } finally {
      this.approvalInProgress = false;
    }
  }

  private startSpinner(text: string) {
    if (!this.spinner) {
      this.spinner = ora();
    }
    this.spinner.start(text);
  }

  private stopSpinner() {
    if (this.spinner) {
      this.spinner.stop();
    }
  }

  private async loadMcpTools(cwd: string): Promise<McpToolDefinition[]> {
    try {
      const mcp = new McpService({ repoRoot: cwd });
      const descriptors = await mcp.listTools();
      return descriptors.map((tool) => ({
        name: `${tool.server}__${tool.name}`,
        description:
          tool.description ?? `MCP tool ${tool.name} from ${tool.server}`,
        inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
        server: tool.server,
      }));
    } catch {
      return [];
    }
  }

  private async askWithMcpTools(
    prompt: string,
    repo: import("../types.js").RepoMetadata,
    workingSet: import("../types.js").WorkingSet,
    mcpTools: McpToolDefinition[],
    history?: ProviderMessage[],
    memoryContext?: string,
    onChunk?: (text: string, type: StreamChunkType) => void,
    doubleCheck = false,
  ): Promise<string> {
    const maxIterations = 5;
    const messages: ProviderMessage[] = [];

    // Convert history to provider messages
    if (history) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Build context for the initial user message
    const contextParts = [
      `Repository: ${repo.rootPath}`,
      `Languages: ${repo.detectedLanguages.join(", ") || "unknown"}`,
      `Package manager: ${repo.packageManager ?? "none"}`,
    ];
    if (memoryContext) {
      contextParts.push("", memoryContext);
    }
    if (workingSet.files.length > 0) {
      contextParts.push("Relevant files:");
      for (const file of workingSet.files.slice(0, 5)) {
        contextParts.push(`  - ${file.path} — ${file.reason}`);
      }
    }
    contextParts.push(
      "",
      "Available MCP tools are attached. Call them by name when needed.",
      "",
      `Question: ${prompt}`,
    );
    messages.push({ role: "user", content: contextParts.join("\n") });

    const mcp = new McpService({ repoRoot: repo.rootPath });
    let doubleChecked = false;

    try {
      for (let i = 0; i < maxIterations; i++) {
        this.stopSpinner();
        this.startSpinner(
          i === 0 ? "Thinking..." : `Using tools (iteration ${i + 1})...`,
        );

        const result = await this.provider.askWithTools(
          messages,
          repo,
          workingSet,
          mcpTools,
        );

        if (result.toolCalls.length === 0) {
          // Double-Check Completion logic
          if (doubleCheck && !doubleChecked) {
            doubleChecked = true;
            this.stopSpinner();
            this.startSpinner("Double-checking requirements...");
            messages.push({
              role: "assistant",
              content: result.text,
            });
            messages.push({
              role: "user",
              content:
                "I've reviewed your response. Please double-check it against the original requirements and any tool outputs. Are you sure you've addressed everything correctly and completely? If you find any missing parts or errors, please correct them now using your tools or by providing an updated response. If you are 100% sure everything is perfect, provide your final response.",
            });
            continue; // Go for one more iteration
          }

          // No more tool calls — return the text
          if (onChunk && result.text) {
            onChunk(result.text, "content");
          }
          return result.text;
        }

        // Record the assistant message with tool calls
        messages.push({
          role: "assistant",
          content: result.text,
          toolCalls: result.toolCalls,
        });

        // Execute each tool call
        const toolResults: ProviderMessage["toolResults"] = [];
        for (const tc of result.toolCalls) {
          const { server, toolName } = this.parseMcpToolName(tc.name);

          // Run beforeTool hooks — plugins can inspect/modify tool args
          const toolCtx = await this.pluginService.runHooks("beforeTool", {
            server,
            tool: toolName,
            args: tc.args,
          });

          try {
            const toolResult = await mcp.callTool(
              server,
              toolName,
              (toolCtx.args as Record<string, unknown>) ?? tc.args,
            );

            // Run afterTool hooks — plugins can observe tool results
            await this.pluginService.runHooks("afterTool", {
              server,
              tool: toolName,
              args: tc.args,
              result: toolResult,
            });

            toolResults.push({
              toolCallId: tc.id,
              content: JSON.stringify(toolResult.data),
              isError: !toolResult.ok,
            });
          } catch (error) {
            toolResults.push({
              toolCallId: tc.id,
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            });
          }
        }

        // Feed tool results back
        messages.push({ role: "user", content: "", toolResults });
      }

      return "Maximum tool iterations reached. The model did not produce a final response.";
    } finally {
      this.stopSpinner();
      await mcp.dispose();
    }
  }

  private parseMcpToolName(name: string): { server: string; toolName: string } {
    const sep = name.indexOf("__");
    if (sep === -1) {
      return { server: name, toolName: name };
    }
    return {
      server: name.slice(0, sep),
      toolName: name.slice(sep + 2),
    };
  }
}

/**
 * Parse `git status --porcelain` output into file paths.
 * Handles renamed files (R  old -> new), copied files, and normal modifications.
 */
function parseGitStatus(statusText: string): string[] {
  const files: string[] = [];
  for (const line of statusText.split("\n")) {
    if (!line.trim()) continue;
    // Format: XY filename (2-char status + space + path)
    if (line.length < 4) continue;
    const statusCode = line.slice(0, 2);
    let filePath = line.slice(3);

    // Renamed or copied: "R  old -> new" or "C  old -> new"
    if (statusCode[0] === "R" || statusCode[0] === "C") {
      const arrowIdx = filePath.indexOf(" -> ");
      if (arrowIdx !== -1) {
        // Use the new path (after ->)
        filePath = filePath.slice(arrowIdx + 4);
      }
    }

    // Unmerged entries (UU, AA, DD, etc.) — also include
    files.push(filePath);
  }
  return files;
}
