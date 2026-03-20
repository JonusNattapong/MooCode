import { z } from "zod";

export const PluginToolDefinitionSchema = z.object({
  name: z.string().min(1, "Tool name is required"),
  description: z.string().min(1, "Tool description is required"),
  parameters: z.record(z.unknown()).optional(),
  handler: z.string().min(1, "Handler path is required"),
});

export const PluginCommandDefinitionSchema = z.object({
  name: z
    .string()
    .min(1, "Command name is required")
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Command name must be lowercase alphanumeric with hyphens",
    ),
  description: z.string().min(1, "Command description is required"),
  handler: z.string().min(1, "Handler path is required"),
});

export const PluginHookDefinitionSchema = z.object({
  event: z.enum(["beforeRun", "afterRun", "beforeTool", "afterTool"]),
  handler: z.string().min(1, "Handler path is required"),
});

export const PluginManifestSchema = z.object({
  name: z
    .string()
    .min(1, "Plugin name is required")
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Plugin name must be lowercase alphanumeric with hyphens",
    ),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+/, "Version must be semver (e.g. 1.0.0)"),
  description: z.string().min(1, "Description is required"),
  author: z.string().min(1, "Author is required"),
  license: z.string().optional(),
  repository: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  tools: z.array(PluginToolDefinitionSchema).optional(),
  commands: z.array(PluginCommandDefinitionSchema).optional(),
  hooks: z.array(PluginHookDefinitionSchema).optional(),
  dependencies: z.record(z.string()).optional(),
  main: z.string().min(1, "Main entry point is required"),
});

export const InstalledPluginSchema = z.object({
  manifest: PluginManifestSchema,
  installPath: z.string(),
  installedAt: z.string(),
  source: z.string(),
});

export const PluginMarketplaceEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  repository: z.string(),
  downloads: z.number().optional(),
  stars: z.number().optional(),
  keywords: z.array(z.string()).optional(),
});
