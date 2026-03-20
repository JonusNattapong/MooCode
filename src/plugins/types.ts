export interface PluginToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler: string;
}

export interface PluginCommandDefinition {
  name: string;
  description: string;
  handler: string;
}

export interface PluginHookDefinition {
  event: "beforeRun" | "afterRun" | "beforeTool" | "afterTool";
  handler: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  repository?: string;
  keywords?: string[];
  tools?: PluginToolDefinition[];
  commands?: PluginCommandDefinition[];
  hooks?: PluginHookDefinition[];
  dependencies?: Record<string, string>;
  main: string;
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  installPath: string;
  installedAt: string;
  source: string;
}

export interface PluginMarketplaceEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  downloads?: number;
  stars?: number;
  keywords?: string[];
}

export interface PluginToolResult {
  ok: boolean;
  summary: string;
  data: unknown;
}

export type PluginToolHandler = (
  args: Record<string, unknown>,
) => Promise<PluginToolResult>;

export type PluginCommandHandler = (args: string[]) => Promise<void>;

export type PluginHookHandler = (
  context: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
