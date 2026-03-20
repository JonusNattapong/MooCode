import type { ToolContext, ToolResult } from "../types.js";
import { McpClient } from "./client.js";
import { isSseServer, loadMcpConfig } from "./config.js";
import { McpSseClient } from "./sseClient.js";
import type { McpServerConfig, McpToolDescriptor } from "./types.js";

type AnyMcpClient = McpClient | McpSseClient;

export class McpService {
  private clients = new Map<string, AnyMcpClient>();

  constructor(private readonly context: ToolContext) {}

  async listServers(): Promise<string[]> {
    const config = await loadMcpConfig(this.context.repoRoot);
    return Object.keys(config.mcpServers).sort();
  }

  async listTools(serverName?: string): Promise<McpToolDescriptor[]> {
    const config = await loadMcpConfig(this.context.repoRoot);
    const entries = Object.entries(config.mcpServers);
    const filtered = serverName
      ? entries.filter(([name]) => name === serverName)
      : entries;

    const tools = await Promise.all(
      filtered.map(async ([name, serverConfig]) => {
        const client = this.getClient(name, serverConfig);
        return await client.listTools();
      }),
    );
    return tools.flat();
  }

  async callTool(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const config = await loadMcpConfig(this.context.repoRoot);
    const serverConfig = config.mcpServers[server];
    if (!serverConfig) {
      throw new Error(`Unknown MCP server: ${server}`);
    }

    const client = this.getClient(server, serverConfig);
    const result = await client.callTool(tool, args);
    return {
      ok: !result.isError,
      summary: `${server}.${tool} ${result.isError ? "failed" : "completed"}`,
      data: result,
    };
  }

  async describeTools(): Promise<string[]> {
    const tools = await this.listTools();
    return tools.map(
      (tool) =>
        `${tool.server}.${tool.name}${tool.description ? ` - ${tool.description}` : ""}`,
    );
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map(async (client) => await client.close()),
    );
    this.clients.clear();
  }

  private getClient(
    serverName: string,
    serverConfig: McpServerConfig,
  ): AnyMcpClient {
    const cached = this.clients.get(serverName);
    if (cached) {
      return cached;
    }

    let client: AnyMcpClient;
    if (isSseServer(serverConfig)) {
      client = new McpSseClient(
        serverName,
        (serverConfig as { url: string }).url,
        serverConfig.env,
      );
    } else {
      client = new McpClient(
        serverName,
        serverConfig as {
          command: string;
          args?: string[];
          env?: Record<string, string>;
        },
        this.context.repoRoot,
      );
    }

    this.clients.set(serverName, client);
    return client;
  }
}
