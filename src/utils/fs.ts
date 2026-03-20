import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
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
  const files = await globby("**/*", {
    cwd: rootPath,
    ignore: DEFAULT_IGNORE,
    gitignore: true,
    dot: true,
  });
  return files.sort();
}

export async function readTextFile(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const absolutePath = path.join(rootPath, relativePath);
  return fs.readFile(absolutePath, "utf8");
}

export async function writeTextFile(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

export async function deleteFile(
  rootPath: string,
  relativePath: string,
): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  await fs.unlink(absolutePath);
}
