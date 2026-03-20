#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { VALID_COMMANDS } from "./config.js";
import { McpService } from "./mcp/service.js";
import { Agent } from "./orchestrator/agent.js";
import { Session } from "./orchestrator/session.js";
import { PluginService } from "./plugins/index.js";
import { providerNames, resolveDefaultProvider } from "./providers/index.js";
import {
  printChangedFiles,
  printDuration,
  printFooter,
  printHeader,
  printJson,
  printKeyValue,
  printPlan,
  printValidation,
} from "./utils/output.js";

interface ParsedArgs {
  [key: string]: string | boolean;
}

interface ParseArgsResult {
  args: ParsedArgs;
  positional: string[];
}

class CliUsageError extends Error {
  constructor(
    message: string,
    public readonly showUsage = false,
  ) {
    super(message);
    this.name = "CliUsageError";
  }
}

const MultiPatchOperationSchema = z
  .object({
    type: z.enum(["create", "replace", "delete"]),
    path: z.string().min(1, "path is required"),
    reason: z.string().min(1, "reason is required"),
    content: z.string().optional(),
    search: z.string().optional(),
    replace: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "create" && typeof value.content !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "content is required for create operations",
      });
    }
    if (value.type === "replace" && typeof value.search !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["search"],
        message: "search is required for replace operations",
      });
    }
    if (value.type === "replace" && typeof value.replace !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["replace"],
        message: "replace is required for replace operations",
      });
    }
  });

const MultiPatchOperationsSchema = z.array(MultiPatchOperationSchema);

function parseArgs(argv: string[]): ParseArgsResult {
  const args: ParsedArgs = {};
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const valueParts: string[] = [];

    while (index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
      valueParts.push(argv[index + 1]);
      index += 1;
    }

    args[key] = valueParts.length === 0 ? true : valueParts.join(" ");
  }

  return { args, positional };
}

function requireArg(args: ParsedArgs, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new CliUsageError(`--${name} is required`, true);
  }
  return value;
}

function assertNoPositional(command: string, positional: string[]): void {
  if (positional.length === 0) {
    return;
  }
  throw new CliUsageError(
    `Unexpected positional argument(s) for ${command}: ${positional.join(" ")}`,
    true,
  );
}

function validateMultiPatchOperations(
  input: unknown,
): z.infer<typeof MultiPatchOperationsSchema> {
  const result = MultiPatchOperationsSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => {
      const pathText = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `- ${pathText}: ${issue.message}`;
    })
    .join("\n");
  throw new CliUsageError(`Invalid --input patch operations:\n${issues}`);
}

function usage(): void {
  console.log(`moocode - CLI-first local coding agent

Usage:
  moocode ask --prompt "Explain this repo"
  moocode plan --prompt "Fix auth bug"
  moocode exec --command "npm test"
  moocode edit --path README.md --search "old" --replace "new"
  moocode edit --input patches.json
  moocode session
  moocode mcp --list
  moocode mcp --server github --tool search_issues --args '{"query":"bug"}'
  moocode plugin --install owner/repo
  moocode plugin --list
  moocode plugin --search "linting"
  moocode plugin --uninstall plugin-name

Commands:
  ask      Ask questions about the repository (read-only)
  plan     Generate a change plan with risk assessment
  exec     Run a validation command with approval
  edit     Apply text replacements with preview and approval
  session  Start an interactive REPL session
  mcp      List or call configured MCP tools
  plugin   Manage plugins (install, uninstall, list, search)

Flags:
  --prompt <text>        Question or task description (required for ask/plan)
  --command <cmd>        Shell command to execute (required for exec)
  --path <file>          Target file path (required for single-file edit)
  --search <text>        Text to find (required for single-file edit)
  --replace <text>       Replacement text (optional for edit, defaults to empty)
  --input <file>         JSON file with multi-file patch operations
  --list                 List configured MCP servers/tools or installed plugins
  --server <name>        MCP server name for mcp command
  --tool <name>          MCP tool name for mcp command
  --args <json>          JSON arguments passed to an MCP tool call
  --install <source>     Install plugin from GitHub (owner/repo) or local path
  --uninstall <name>     Uninstall a plugin by name
  --search <query>       Search marketplace for plugins
  --cwd <path>           Working directory (defaults to current directory)
  --provider <name>      LLM provider to use (${providerNames.join(", ")})
  --auto-approve         Skip interactive approval prompts
  --yolo                 Enable YOLO mode (auto-approve + skip planning)
  --double-check         Re-verify completion against original requirements
  --help, -h             Show this help message

Examples:
  moocode ask --prompt "What does this project do?"
  moocode plan --prompt "Add error handling to parser"
  moocode exec --command "npm run check"
  moocode edit --path src/index.ts --search "old" --replace "new"
  moocode edit --input patches.json
  moocode mcp --list
  moocode mcp --server github --list
  moocode mcp --server github --tool search_issues --args '{"query":"bug is:open"}'
  moocode plugin --install moocode-plugins/eslint-plugin
  moocode plugin --install ./my-local-plugin
  moocode plugin --list
  moocode plugin --search "code quality"
  moocode plugin --uninstall eslint-plugin

For more information, see README.md and docs/architecture.md
`);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (!VALID_COMMANDS.includes(command as (typeof VALID_COMMANDS)[number])) {
    console.error(`Error: Unknown command '${command}'\n`);
    usage();
    process.exitCode = 1;
    return;
  }

  const { args, positional } = parseArgs(rest);
  const cwd = path.resolve(
    typeof args.cwd === "string" ? args.cwd : process.cwd(),
  );
  const providerName =
    typeof args.provider === "string" ? args.provider : undefined;
  const provider = resolveDefaultProvider(providerName);
  const agent = new Agent(provider);
  let startTime: number | null = null;

  try {
    if (command === "ask" || command === "plan") {
      assertNoPositional(command, positional);
      const prompt = requireArg(args, "prompt");
      startTime = Date.now();
      const result = await agent.run({
        cwd,
        mode: command,
        prompt,
        autoApprove: Boolean(args["auto-approve"]) || Boolean(args.yolo),
        yolo: Boolean(args.yolo),
        doubleCheck: Boolean(args["double-check"]),
      });
      printHeader(result.status);
      printKeyValue("summary:", result.summary);
      if (result.plan) {
        printPlan(result.plan);
      }
      printFooter();
      const durationMs = Date.now() - startTime;
      printDuration(durationMs);
      return;
    }

    if (command === "exec") {
      assertNoPositional(command, positional);
      const cmd = requireArg(args, "command");
      startTime = Date.now();
      const result = await agent.run({
        cwd,
        mode: "exec",
        prompt: `Run command ${cmd}`,
        command: cmd,
        autoApprove: Boolean(args["auto-approve"]) || Boolean(args.yolo),
        yolo: Boolean(args.yolo),
        doubleCheck: Boolean(args["double-check"]),
      });
      printHeader(result.status);
      printValidation(result.validation ?? []);
      printFooter();
      const durationMs = Date.now() - startTime;
      printDuration(durationMs);
      return;
    }

    if (command === "edit") {
      assertNoPositional(command, positional);
      const inputPath = typeof args.input === "string" ? args.input : undefined;

      if (inputPath) {
        // Multi-file edit from JSON file
        const raw = await fs.readFile(inputPath, "utf8");
        const operations = validateMultiPatchOperations(JSON.parse(raw));
        startTime = Date.now();
        const result = await agent.run({
          cwd,
          mode: "edit",
          prompt: `Apply ${operations.length} patch operations`,
          multiPatch: operations,
          autoApprove: Boolean(args["auto-approve"]) || Boolean(args.yolo),
          yolo: Boolean(args.yolo),
          doubleCheck: Boolean(args["double-check"]),
        });
        printHeader(result.status);
        printChangedFiles(result.changedFiles ?? []);
        printFooter();
      } else {
        // Single-file edit
        const filePath = requireArg(args, "path");
        const search = requireArg(args, "search");
        const replace = typeof args.replace === "string" ? args.replace : "";
        startTime = Date.now();
        const result = await agent.run({
          cwd,
          mode: "edit",
          prompt: `Edit ${filePath}`,
          patch: { path: filePath, search, replace },
          autoApprove: Boolean(args["auto-approve"]) || Boolean(args.yolo),
          yolo: Boolean(args.yolo),
          doubleCheck: Boolean(args["double-check"]),
        });
        printHeader(result.status);
        printChangedFiles(result.changedFiles ?? []);
        printFooter();
      }
      const durationMs = Date.now() - startTime;
      printDuration(durationMs);
      return;
    }

    if (command === "session") {
      assertNoPositional(command, positional);
      const session = new Session(provider, cwd, Boolean(args["auto-approve"]));
      startTime = Date.now();
      await session.run();
      return;
    }

    if (command === "mcp") {
      assertNoPositional(command, positional);
      const mcp = new McpService({ repoRoot: cwd });
      startTime = Date.now();

      try {
        const serverName =
          typeof args.server === "string" ? args.server : undefined;
        const toolName = typeof args.tool === "string" ? args.tool : undefined;

        if (toolName) {
          if (!serverName) {
            throw new CliUsageError(
              "--server is required when using --tool",
              true,
            );
          }
          const parsedArgs =
            typeof args.args === "string" ? JSON.parse(args.args) : {};
          if (
            parsedArgs === null ||
            Array.isArray(parsedArgs) ||
            typeof parsedArgs !== "object"
          ) {
            throw new CliUsageError("--args must be a JSON object");
          }
          const result = await mcp.callTool(
            serverName,
            toolName,
            parsedArgs as Record<string, unknown>,
          );
          printHeader(result.summary);
          printJson(result.data);
          printFooter();
          printDuration(Date.now() - startTime);
          return;
        }

        if (serverName) {
          const tools = await mcp.listTools(serverName);
          printHeader(`mcp tools (${serverName})`);
          printJson(tools);
          printFooter();
          printDuration(Date.now() - startTime);
          return;
        }

        const servers = await mcp.listServers();
        printHeader("mcp servers");
        printJson(servers);
        printFooter();
        printDuration(Date.now() - startTime);
        return;
      } finally {
        await mcp.dispose();
      }
    }

    if (command === "plugin") {
      assertNoPositional(command, positional);
      const pluginService = new PluginService();
      startTime = Date.now();

      const installSource =
        typeof args.install === "string" ? args.install : undefined;
      const uninstallName =
        typeof args.uninstall === "string" ? args.uninstall : undefined;
      const searchQuery =
        typeof args.search === "string" ? args.search : undefined;
      const showList = Boolean(args.list);

      if (installSource) {
        const plugin = await pluginService.install(installSource);
        printHeader("plugin installed");
        printKeyValue("name:", plugin.manifest.name);
        printKeyValue("version:", plugin.manifest.version);
        printKeyValue("description:", plugin.manifest.description);
        printKeyValue("author:", plugin.manifest.author);
        if (plugin.manifest.tools?.length) {
          printKeyValue(
            "tools:",
            plugin.manifest.tools.map((t) => t.name).join(", "),
          );
        }
        if (plugin.manifest.commands?.length) {
          printKeyValue(
            "commands:",
            plugin.manifest.commands.map((c) => c.name).join(", "),
          );
        }
        printFooter();
        printDuration(Date.now() - startTime);
        return;
      }

      if (uninstallName) {
        await pluginService.uninstall(uninstallName);
        printHeader("plugin uninstalled");
        printKeyValue("name:", uninstallName);
        printFooter();
        printDuration(Date.now() - startTime);
        return;
      }

      if (searchQuery !== undefined) {
        const results = await pluginService.search(searchQuery || undefined);
        printHeader("marketplace");
        if (results.length === 0) {
          printKeyValue("result:", "No plugins found");
        } else {
          for (const entry of results) {
            printKeyValue(`${entry.name}:`, entry.description);
            printKeyValue(
              "  ",
              `v${entry.version} by ${entry.author}${entry.stars ? ` (${entry.stars} stars)` : ""}`,
            );
          }
        }
        printFooter();
        printDuration(Date.now() - startTime);
        return;
      }

      if (
        showList ||
        (!installSource && !uninstallName && searchQuery === undefined)
      ) {
        const plugins = await pluginService.list();
        printHeader("installed plugins");
        if (plugins.length === 0) {
          printKeyValue("result:", "No plugins installed");
          printKeyValue(
            "hint:",
            "Use --install <owner/repo> or --search <query>",
          );
        } else {
          for (const p of plugins) {
            printKeyValue(
              `${p.manifest.name}@${p.manifest.version}:`,
              p.manifest.description,
            );
            printKeyValue("  author:", p.manifest.author);
            if (p.manifest.tools?.length) {
              printKeyValue(
                "  tools:",
                p.manifest.tools.map((t) => t.name).join(", "),
              );
            }
            if (p.manifest.commands?.length) {
              printKeyValue(
                "  commands:",
                p.manifest.commands.map((c) => c.name).join(", "),
              );
            }
          }
        }
        printFooter();
        printDuration(Date.now() - startTime);
        return;
      }
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
      if (error.showUsage) {
        console.error("");
        usage();
      }
      process.exitCode = 1;
      return;
    }

    if (startTime !== null && command !== "session") {
      const durationMs = Date.now() - startTime;
      printDuration(durationMs);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main().catch(() => {
  process.exitCode = 1;
});
