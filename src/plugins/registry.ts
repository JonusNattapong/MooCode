import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { PluginManifestSchema } from "./schema.js";
import type { InstalledPlugin, PluginManifest } from "./types.js";

const REGISTRY_FILE = "registry.json";

function getPluginsDir(): string {
  return path.join(os.homedir(), ".moocode", "plugins");
}

function getRegistryPath(): string {
  return path.join(getPluginsDir(), REGISTRY_FILE);
}

async function ensurePluginsDir(): Promise<void> {
  await fs.mkdir(getPluginsDir(), { recursive: true });
}

async function loadRegistry(): Promise<InstalledPlugin[]> {
  const registryPath = getRegistryPath();
  try {
    const raw = await fs.readFile(registryPath, "utf8");
    return JSON.parse(raw) as InstalledPlugin[];
  } catch {
    return [];
  }
}

async function saveRegistry(plugins: InstalledPlugin[]): Promise<void> {
  await ensurePluginsDir();
  await fs.writeFile(
    getRegistryPath(),
    JSON.stringify(plugins, null, 2),
    "utf8",
  );
}

function parseGitHubSource(source: string): {
  owner: string;
  repo: string;
  ref?: string;
} | null {
  // github:owner/repo or github:owner/repo@ref
  const ghMatch = source.match(
    /^github:([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:@(.+))?$/,
  );
  if (ghMatch) {
    return { owner: ghMatch[1], repo: ghMatch[2], ref: ghMatch[3] };
  }

  // https://github.com/owner/repo or https://github.com/owner/repo@ref
  const urlMatch = source.match(
    /^https?:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:@(.+))?$/,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], ref: urlMatch[3] };
  }

  // owner/repo shorthand
  const shorthandMatch = source.match(
    /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:@(.+))?$/,
  );
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2],
      ref: shorthandMatch[3],
    };
  }

  return null;
}

async function clonePlugin(
  owner: string,
  repo: string,
  ref: string | undefined,
  installPath: string,
): Promise<void> {
  const url = `https://github.com/${owner}/${repo}.git`;
  const cloneArgs = ["clone", "--depth", "1"];
  if (ref) {
    cloneArgs.push("--branch", ref);
  }
  cloneArgs.push(url, installPath);

  await execa("git", cloneArgs);
}

async function loadManifest(pluginDir: string): Promise<PluginManifest> {
  const manifestPath = path.join(pluginDir, "plugin.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  return PluginManifestSchema.parse(parsed);
}

async function installPluginDependencies(
  pluginDir: string,
  manifest: PluginManifest,
): Promise<void> {
  if (
    !manifest.dependencies ||
    Object.keys(manifest.dependencies).length === 0
  ) {
    return;
  }

  const pkgPath = path.join(pluginDir, "package.json");
  try {
    await fs.access(pkgPath);
    await execa("npm", ["install", "--production"], { cwd: pluginDir });
  } catch {
    // No package.json or npm install failed — skip silently
  }
}

export async function installPlugin(source: string): Promise<InstalledPlugin> {
  const pluginsDir = getPluginsDir();
  await ensurePluginsDir();

  const registry = await loadRegistry();

  const ghInfo = parseGitHubSource(source);

  let manifest: PluginManifest;
  let installPath: string;
  let resolvedSource: string;

  if (ghInfo) {
    // Install from GitHub
    const { owner, repo, ref } = ghInfo;
    installPath = path.join(pluginsDir, repo);
    resolvedSource = ref
      ? `github:${owner}/${repo}@${ref}`
      : `github:${owner}/${repo}`;

    // Check if already installed
    const existing = registry.find((p) => p.manifest.name === repo);
    if (existing) {
      // Remove and reinstall
      await fs.rm(existing.installPath, { recursive: true, force: true });
      const idx = registry.indexOf(existing);
      registry.splice(idx, 1);
    }

    await clonePlugin(owner, repo, ref, installPath);
    manifest = await loadManifest(installPath);
    await installPluginDependencies(installPath, manifest);
  } else {
    // Install from local path
    const localPath = path.resolve(source);
    installPath = path.join(pluginsDir, path.basename(localPath));
    resolvedSource = `file:${localPath}`;

    const existing = registry.find((p) => p.installPath === installPath);
    if (existing) {
      await fs.rm(existing.installPath, { recursive: true, force: true });
      const idx = registry.indexOf(existing);
      registry.splice(idx, 1);
    }

    // Copy local plugin
    await copyDir(localPath, installPath);
    manifest = await loadManifest(installPath);
    await installPluginDependencies(installPath, manifest);
  }

  // Validate no duplicate names
  const duplicate = registry.find((p) => p.manifest.name === manifest.name);
  if (duplicate) {
    await fs.rm(installPath, { recursive: true, force: true });
    throw new Error(
      `Plugin "${manifest.name}" is already installed. Uninstall it first.`,
    );
  }

  const installed: InstalledPlugin = {
    manifest,
    installPath,
    installedAt: new Date().toISOString(),
    source: resolvedSource,
  };

  registry.push(installed);
  await saveRegistry(registry);

  return installed;
}

export async function uninstallPlugin(name: string): Promise<void> {
  const registry = await loadRegistry();
  const idx = registry.findIndex((p) => p.manifest.name === name);

  if (idx === -1) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  const plugin = registry[idx];
  await fs.rm(plugin.installPath, { recursive: true, force: true });
  registry.splice(idx, 1);
  await saveRegistry(registry);
}

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return loadRegistry();
}

export async function getPluginByName(
  name: string,
): Promise<InstalledPlugin | undefined> {
  const registry = await loadRegistry();
  return registry.find((p) => p.manifest.name === name);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
