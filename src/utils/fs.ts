import fs from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import { DEFAULT_IGNORE } from "../config.js";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(rootPath: string): Promise<string[]> {
  const ig = ignore().add(DEFAULT_IGNORE);
  const files: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath) || entry.name;
      if (ig.ignores(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      files.push(relativePath);
    }
  }

  await walk(rootPath);
  return files.sort();
}

export async function readTextFile(rootPath: string, relativePath: string): Promise<string> {
  const absolutePath = path.join(rootPath, relativePath);
  return fs.readFile(absolutePath, "utf8");
}

export async function writeTextFile(rootPath: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

export async function deleteFile(rootPath: string, relativePath: string): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  await fs.unlink(absolutePath);
}
