import path from "node:path";
import type { ToolResult } from "../types.js";
import { listInstalledPlugins } from "./registry.js";
import type {
  InstalledPlugin,
  PluginCommandHandler,
  PluginHookHandler,
  PluginToolHandler,
} from "./types.js";

interface LoadedTool {
  pluginName: string;
  name: string;
  description: string;
  handler: PluginToolHandler;
}

interface LoadedCommand {
  pluginName: string;
  name: string;
  description: string;
  handler: PluginCommandHandler;
}

interface LoadedHook {
  pluginName: string;
  event: string;
  handler: PluginHookHandler;
}

export class PluginLoader {
  private tools = new Map<string, LoadedTool>();
  private commands = new Map<string, LoadedCommand>();
  private hooks = new Map<string, LoadedHook[]>();
  private loadErrors: Array<{ plugin: string; error: string }> = [];

  async loadAll(): Promise<void> {
    this.tools.clear();
    this.commands.clear();
    this.hooks.clear();
    this.loadErrors = [];

    const plugins = await listInstalledPlugins();

    for (const plugin of plugins) {
      try {
        await this.loadPlugin(plugin);
      } catch (error) {
        this.loadErrors.push({
          plugin: plugin.manifest.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  getCommandNames(): string[] {
    return [...this.commands.keys()];
  }

  getLoadErrors(): Array<{ plugin: string; error: string }> {
    return this.loadErrors;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown plugin tool: ${name}`);
    }

    try {
      const result = await tool.handler(args);
      return {
        ok: result.ok,
        summary: result.summary,
        data: result.data,
      };
    } catch (error) {
      return {
        ok: false,
        summary: `Plugin tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        data: null,
      };
    }
  }

  async runCommand(name: string, args: string[]): Promise<void> {
    const cmd = this.commands.get(name);
    if (!cmd) {
      throw new Error(`Unknown plugin command: ${name}`);
    }
    await cmd.handler(args);
  }

  async runHooks(
    event: string,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const hooks = this.hooks.get(event) ?? [];
    let ctx = { ...context };

    for (const hook of hooks) {
      try {
        ctx = await hook.handler(ctx);
      } catch {
        // Hook errors are non-fatal
      }
    }

    return ctx;
  }

  describeTools(): Array<{
    plugin: string;
    name: string;
    description: string;
  }> {
    return [...this.tools.values()].map((t) => ({
      plugin: t.pluginName,
      name: t.name,
      description: t.description,
    }));
  }

  describeCommands(): Array<{
    plugin: string;
    name: string;
    description: string;
  }> {
    return [...this.commands.values()].map((c) => ({
      plugin: c.pluginName,
      name: c.name,
      description: c.description,
    }));
  }

  private async loadPlugin(plugin: InstalledPlugin): Promise<void> {
    const mainPath = path.resolve(plugin.installPath, plugin.manifest.main);

    let mod: Record<string, unknown>;
    try {
      const imported = await import(mainPath);
      mod = imported.default ?? imported;
    } catch (error) {
      throw new Error(
        `Failed to load main module "${plugin.manifest.main}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Load tools
    if (plugin.manifest.tools) {
      for (const toolDef of plugin.manifest.tools) {
        const key = `${plugin.manifest.name}.${toolDef.name}`;

        const handlerFn = this.resolveExport<PluginToolHandler>(
          mod,
          toolDef.handler,
          plugin.manifest.name,
        );

        this.tools.set(key, {
          pluginName: plugin.manifest.name,
          name: key,
          description: toolDef.description,
          handler: handlerFn,
        });
      }
    }

    // Load commands
    if (plugin.manifest.commands) {
      for (const cmdDef of plugin.manifest.commands) {
        const key = `${plugin.manifest.name}.${cmdDef.name}`;

        const handlerFn = this.resolveExport<PluginCommandHandler>(
          mod,
          cmdDef.handler,
          plugin.manifest.name,
        );

        this.commands.set(key, {
          pluginName: plugin.manifest.name,
          name: key,
          description: cmdDef.description,
          handler: handlerFn,
        });
      }
    }

    // Load hooks
    if (plugin.manifest.hooks) {
      for (const hookDef of plugin.manifest.hooks) {
        const handlerFn = this.resolveExport<PluginHookHandler>(
          mod,
          hookDef.handler,
          plugin.manifest.name,
        );

        const existing = this.hooks.get(hookDef.event) ?? [];
        existing.push({
          pluginName: plugin.manifest.name,
          event: hookDef.event,
          handler: handlerFn,
        });
        this.hooks.set(hookDef.event, existing);
      }
    }
  }

  private resolveExport<T>(
    mod: Record<string, unknown>,
    handlerName: string,
    pluginName: string,
  ): T {
    const fn = mod[handlerName];
    if (typeof fn !== "function") {
      throw new Error(
        `Handler "${handlerName}" not found or not a function in plugin "${pluginName}"`,
      );
    }
    return fn as T;
  }
}
