import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpConfigFile } from "./types.js";

const McpStdioConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const McpSseConfigSchema = z.object({
  url: z.string().url().startsWith("http"),
  env: z.record(z.string()).optional(),
});

const McpServerConfigSchema = z.union([
  McpStdioConfigSchema,
  McpSseConfigSchema,
]);

const McpConfigFileSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema),
});

export async function loadMcpConfig(cwd: string): Promise<McpConfigFile> {
  const projectPath = path.join(cwd, ".mcp.json");
  const homePath = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? "",
    ".mcp.json",
  );

  // Try project-level config first, then home directory
  for (const configPath of [projectPath, homePath]) {
    try {
      const raw = await fs.readFile(configPath, "utf8");
      return McpConfigFileSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid .mcp.json: ${error.issues.map((issue) => issue.message).join(", ")}`,
        );
      }
      throw error;
    }
  }

  return { mcpServers: {} };
}

export function isSseServer(
  config: McpConfigFile["mcpServers"][string],
): boolean {
  return "url" in config && typeof config.url === "string";
}
