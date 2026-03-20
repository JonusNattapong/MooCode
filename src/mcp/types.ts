export interface McpStdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: never;
}

export interface McpSseServerConfig {
  url: string;
  command?: never;
  args?: never;
  env?: Record<string, string>;
}

export type McpServerConfig = McpStdioServerConfig | McpSseServerConfig;

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpToolDescriptor {
  server: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpCallResult {
  server: string;
  tool: string;
  content: unknown;
  isError?: boolean;
}
