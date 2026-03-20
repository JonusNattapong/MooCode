import type { ToolResult } from "../types.js";
import { PluginLoader } from "./loader.js";
import { getPluginDetails, searchPlugins } from "./marketplace.js";
import {
  installPlugin,
  listInstalledPlugins,
  uninstallPlugin,
} from "./registry.js";
import type { InstalledPlugin, PluginMarketplaceEntry } from "./types.js";

export class PluginService {
  private loader: PluginLoader;
  private initialized = false;

  constructor() {
    this.loader = new PluginLoader();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.loader.loadAll();
    this.initialized = true;
  }

  async install(source: string): Promise<InstalledPlugin> {
    const plugin = await installPlugin(source);
    await this.loader.loadAll();
    return plugin;
  }

  async uninstall(name: string): Promise<void> {
    await uninstallPlugin(name);
    await this.loader.loadAll();
  }

  async list(): Promise<InstalledPlugin[]> {
    return listInstalledPlugins();
  }

  async search(query?: string): Promise<PluginMarketplaceEntry[]> {
    return searchPlugins(query);
  }

  async info(fullName: string): Promise<PluginMarketplaceEntry | null> {
    return getPluginDetails(fullName);
  }

  getTools(): Array<{ plugin: string; name: string; description: string }> {
    return this.loader.describeTools();
  }

  getCommands(): Array<{ plugin: string; name: string; description: string }> {
    return this.loader.describeCommands();
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    await this.ensureInitialized();
    return this.loader.callTool(name, args);
  }

  async runCommand(name: string, args: string[]): Promise<void> {
    await this.ensureInitialized();
    return this.loader.runCommand(name, args);
  }

  async runHooks(
    event: string,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await this.ensureInitialized();
    return this.loader.runHooks(event, context);
  }

  getLoadErrors(): Array<{ plugin: string; error: string }> {
    return this.loader.getLoadErrors();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }
}
