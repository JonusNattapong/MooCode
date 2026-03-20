export { PluginLoader } from "./loader.js";
export {
  fetchPluginManifest,
  getPluginDetails,
  searchPlugins,
} from "./marketplace.js";
export {
  getPluginByName,
  installPlugin,
  listInstalledPlugins,
  uninstallPlugin,
} from "./registry.js";
export {
  InstalledPluginSchema,
  PluginManifestSchema,
  PluginMarketplaceEntrySchema,
} from "./schema.js";
export { PluginService } from "./service.js";
export type {
  InstalledPlugin,
  PluginCommandDefinition,
  PluginCommandHandler,
  PluginHookDefinition,
  PluginHookHandler,
  PluginManifest,
  PluginMarketplaceEntry,
  PluginToolDefinition,
  PluginToolHandler,
  PluginToolResult,
} from "./types.js";
