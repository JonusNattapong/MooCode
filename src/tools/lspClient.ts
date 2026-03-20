import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import type { ToolContext, ToolResult } from "../types.js";

// ── LSP Types ────────────────────────────────────────────────────────────────

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface LspLocation {
  uri: string;
  range: LspRange;
}

interface LspLocationLink {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange: LspRange;
  originSelectionRange?: LspRange;
}

interface LspHover {
  contents: unknown;
  range?: LspRange;
}

interface LspSymbolInformation {
  name: string;
  kind: number;
  location: LspLocation;
  containerName?: string;
}

interface LspDocumentSymbol {
  name: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

// ── Symbol Kind Names ────────────────────────────────────────────────────────

const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

// ── Language Server Configurations ───────────────────────────────────────────

interface LanguageServerConfig {
  command: string;
  args: string[];
  languages: string[];
  fileExtensions: string[];
}

const LANGUAGE_SERVERS: LanguageServerConfig[] = [
  {
    command: "typescript-language-server",
    args: ["--stdio"],
    languages: ["typescript", "javascript"],
    fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  {
    command: "pyright-langserver",
    args: ["--stdio"],
    languages: ["python"],
    fileExtensions: [".py", ".pyi"],
  },
  {
    command: "gopls",
    args: ["serve"],
    languages: ["go"],
    fileExtensions: [".go"],
  },
  {
    command: "rust-analyzer",
    args: [],
    languages: ["rust"],
    fileExtensions: [".rs"],
  },
  {
    command: "lua-language-server",
    args: [],
    languages: ["lua"],
    fileExtensions: [".lua"],
  },
  {
    command: "clangd",
    args: [],
    languages: ["c", "cpp"],
    fileExtensions: [".c", ".h", ".cpp", ".hpp", ".cc", ".cxx"],
  },
];

// ── JSON-RPC over Stdio Client ───────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

class LspRpcClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private buffer = Buffer.alloc(0);
  private _initialized = false;

  get isInitialized(): boolean {
    return this._initialized;
  }

  async start(command: string, args: string[], rootUri: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.process = spawn(command, args, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: rootUri.replace("file://", ""),
        });

        this.process.on("error", (err) => {
          reject(
            new Error(
              `Failed to start language server "${command}": ${err.message}`,
            ),
          );
        });

        this.process.stderr?.on("data", () => {
          // Silently consume stderr from language servers
        });

        this.process.stdout?.on("data", (chunk: Buffer) => {
          this.buffer = Buffer.concat([this.buffer, chunk]);
          this.parseMessages();
        });

        // Wait a tick for the process to be ready
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            resolve();
          } else {
            reject(
              new Error(`Language server "${command}" exited prematurely`),
            );
          }
        }, 100);
      } catch (err) {
        reject(
          new Error(
            `Failed to start language server "${command}": ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  async initialize(rootUri: string): Promise<void> {
    const result = await this.sendRequest("initialize", {
      processId: process.pid,
      rootUri,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ["plaintext"] },
          definition: { linkSupport: false },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        },
        workspace: {},
      },
      workspaceFolders: [{ uri: rootUri, name: path.basename(rootUri) }],
    });

    // Send initialized notification
    await this.sendNotification("initialized", {});
    this._initialized = true;

    return result as void;
  }

  async shutdown(): Promise<void> {
    if (!this.process) return;

    try {
      await this.sendRequest("shutdown", null);
      await this.sendNotification("exit", null);
    } catch {
      // Ignore errors during shutdown
    }

    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = null;
    this._initialized = false;
    this.pendingRequests.clear();
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.process || this.process.killed) {
      throw new Error("Language server process is not running");
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const message = this.encodeMessage(request);

    return new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request "${method}" timed out (id: ${id})`));
      }, 15000);

      // Store timeout to clear on response
      const pending = this.pendingRequests.get(id)!;
      const origResolve = pending.resolve;
      const origReject = pending.reject;
      pending.resolve = (value: unknown) => {
        clearTimeout(timeout);
        origResolve(value);
      };
      pending.reject = (reason: Error) => {
        clearTimeout(timeout);
        origReject(reason);
      };

      this.process!.stdin!.write(message);
    });
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    if (!this.process || this.process.killed) {
      throw new Error("Language server process is not running");
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    const message = this.encodeMessage(notification);
    this.process.stdin!.write(message);
  }

  private encodeMessage(msg: JsonRpcRequest | JsonRpcNotification): Buffer {
    const content = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    return Buffer.concat([
      Buffer.from(header, "utf-8"),
      Buffer.from(content, "utf-8"),
    ]);
  }

  private parseMessages(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const headerStr = this.buffer.subarray(0, headerEnd).toString("utf-8");
      const match = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Invalid header, try to skip
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const messageStart = headerEnd + 4;

      if (this.buffer.length < messageStart + contentLength) break;

      const body = this.buffer
        .subarray(messageStart, messageStart + contentLength)
        .toString("utf-8");
      this.buffer = this.buffer.subarray(messageStart + contentLength);

      try {
        const msg = JSON.parse(body);
        this.handleMessage(msg);
      } catch {
        // Skip malformed messages
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification): void {
    if ("id" in msg && msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(
            new Error(
              `LSP error: ${msg.error.message} (code: ${msg.error.code})`,
            ),
          );
        } else {
          pending.resolve(msg.result);
        }
      }
    }
    // Notifications from server are silently consumed
  }
}

// ── LSP Manager (per-workspace) ──────────────────────────────────────────────

interface ServerEntry {
  client: LspRpcClient;
  config: LanguageServerConfig;
  openDocuments: Set<string>;
}

const serverInstances = new Map<string, Map<string, ServerEntry>>();

function getWorkspaceKey(rootUri: string): string {
  return rootUri;
}

function detectLanguageServer(filePath: string): LanguageServerConfig | null {
  const ext = path.extname(filePath).toLowerCase();
  for (const config of LANGUAGE_SERVERS) {
    if (config.fileExtensions.includes(ext)) {
      return config;
    }
  }
  return null;
}

async function getOrCreateServer(
  context: ToolContext,
  filePath: string,
): Promise<ServerEntry | null> {
  const rootUri = `file://${context.repoRoot}`;
  const workspaceKey = getWorkspaceKey(rootUri);

  const config = detectLanguageServer(filePath);
  if (!config) return null;

  let workspaceServers = serverInstances.get(workspaceKey);
  if (!workspaceServers) {
    workspaceServers = new Map();
    serverInstances.set(workspaceKey, workspaceServers);
  }

  const existing = workspaceServers.get(config.command);
  if (existing && existing.client.isInitialized) {
    return existing;
  }

  const client = new LspRpcClient();
  try {
    await client.start(config.command, config.args, rootUri);
    await client.initialize(rootUri);
  } catch {
    await client.shutdown().catch(() => {});
    return null;
  }

  const entry: ServerEntry = {
    client,
    config,
    openDocuments: new Set(),
  };
  workspaceServers.set(config.command, entry);
  return entry;
}

async function ensureDocumentOpen(
  entry: ServerEntry,
  filePath: string,
  context: ToolContext,
): Promise<string> {
  const uri = `file://${path.resolve(context.repoRoot, filePath)}`;

  if (!entry.openDocuments.has(uri)) {
    const fs = await import("node:fs/promises");
    let content: string;
    try {
      content = await fs.readFile(
        path.resolve(context.repoRoot, filePath),
        "utf-8",
      );
    } catch {
      throw new Error(`Cannot read file: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const languageId =
      {
        ".ts": "typescript",
        ".tsx": "typescriptreact",
        ".js": "javascript",
        ".jsx": "javascriptreact",
        ".py": "python",
        ".go": "go",
        ".rs": "rust",
        ".lua": "lua",
        ".c": "c",
        ".h": "c",
        ".cpp": "cpp",
        ".hpp": "cpp",
        ".cc": "cpp",
      }[ext] ?? "plaintext";

    await entry.client.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });
    entry.openDocuments.add(uri);
  }

  return uri;
}

// ── Location Formatting ──────────────────────────────────────────────────────

function uriToRelativePath(uri: string, repoRoot: string): string {
  const filePath = uri.replace("file://", "").replace(/^\/([a-zA-Z]):/, "$1:");
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function formatLocation(loc: LspLocation, repoRoot: string): string {
  const relPath = uriToRelativePath(loc.uri, repoRoot);
  return `${relPath}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
}

function formatRange(range: LspRange): string {
  return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
}

// ── Public Tool Functions ────────────────────────────────────────────────────

export async function goToDefinitionTool(
  context: ToolContext,
  filePath: string,
  line: number,
  character: number,
): Promise<ToolResult> {
  const entry = await getOrCreateServer(context, filePath);
  if (!entry) {
    return {
      ok: false,
      summary: `No language server available for ${path.extname(filePath)} files`,
      data: { error: "unsupported_language" },
    };
  }

  const uri = await ensureDocumentOpen(entry, filePath, context);

  const result = (await entry.client.sendRequest("textDocument/definition", {
    textDocument: { uri },
    position: { line: line - 1, character: character - 1 },
  })) as LspLocation[] | LspLocationLink[] | null;

  if (!result || (Array.isArray(result) && result.length === 0)) {
    return {
      ok: true,
      summary: "No definition found at this position",
      data: { locations: [] },
    };
  }

  const locations = Array.isArray(result) ? result : [result];
  const formatted = locations.map((loc) => {
    const location =
      "targetUri" in loc
        ? { uri: loc.targetUri, range: loc.targetSelectionRange }
        : loc;
    return {
      file: uriToRelativePath(location.uri, context.repoRoot),
      line: location.range.start.line + 1,
      character: location.range.start.character + 1,
      endLine: location.range.end.line + 1,
      endCharacter: location.range.end.character + 1,
      display: formatLocation(location, context.repoRoot),
    };
  });

  return {
    ok: true,
    summary: `Found ${formatted.length} definition(s)`,
    data: { locations: formatted },
  };
}

export async function findReferencesTool(
  context: ToolContext,
  filePath: string,
  line: number,
  character: number,
  includeDeclaration = true,
): Promise<ToolResult> {
  const entry = await getOrCreateServer(context, filePath);
  if (!entry) {
    return {
      ok: false,
      summary: `No language server available for ${path.extname(filePath)} files`,
      data: { error: "unsupported_language" },
    };
  }

  const uri = await ensureDocumentOpen(entry, filePath, context);

  const result = (await entry.client.sendRequest("textDocument/references", {
    textDocument: { uri },
    position: { line: line - 1, character: character - 1 },
    context: { includeDeclaration },
  })) as LspLocation[] | null;

  if (!result || result.length === 0) {
    return {
      ok: true,
      summary: "No references found at this position",
      data: { references: [] },
    };
  }

  const formatted = result.map((loc) => ({
    file: uriToRelativePath(loc.uri, context.repoRoot),
    line: loc.range.start.line + 1,
    character: loc.range.start.character + 1,
    endLine: loc.range.end.line + 1,
    endCharacter: loc.range.end.character + 1,
    display: formatLocation(loc, context.repoRoot),
  }));

  return {
    ok: true,
    summary: `Found ${formatted.length} reference(s)`,
    data: { references: formatted },
  };
}

export async function hoverTool(
  context: ToolContext,
  filePath: string,
  line: number,
  character: number,
): Promise<ToolResult> {
  const entry = await getOrCreateServer(context, filePath);
  if (!entry) {
    return {
      ok: false,
      summary: `No language server available for ${path.extname(filePath)} files`,
      data: { error: "unsupported_language" },
    };
  }

  const uri = await ensureDocumentOpen(entry, filePath, context);

  const result = (await entry.client.sendRequest("textDocument/hover", {
    textDocument: { uri },
    position: { line: line - 1, character: character - 1 },
  })) as LspHover | null;

  if (!result) {
    return {
      ok: true,
      summary: "No hover information at this position",
      data: null,
    };
  }

  let text = "";
  if (typeof result.contents === "string") {
    text = result.contents;
  } else if (Array.isArray(result.contents)) {
    text = result.contents
      .map((c) =>
        typeof c === "string" ? c : ((c as { value: string }).value ?? ""),
      )
      .join("\n");
  } else if (
    result.contents &&
    typeof result.contents === "object" &&
    "value" in result.contents
  ) {
    text = (result.contents as { value: string }).value;
  }

  return {
    ok: true,
    summary: "Retrieved hover information",
    data: {
      text,
      range: result.range ? formatRange(result.range) : null,
    },
  };
}

export async function documentSymbolsTool(
  context: ToolContext,
  filePath: string,
): Promise<ToolResult> {
  const entry = await getOrCreateServer(context, filePath);
  if (!entry) {
    return {
      ok: false,
      summary: `No language server available for ${path.extname(filePath)} files`,
      data: { error: "unsupported_language" },
    };
  }

  await ensureDocumentOpen(entry, filePath, context);
  const uri = `file://${path.resolve(context.repoRoot, filePath)}`;

  const result = (await entry.client.sendRequest(
    "textDocument/documentSymbol",
    {
      textDocument: { uri },
    },
  )) as LspDocumentSymbol[] | LspSymbolInformation[] | null;

  if (!result || result.length === 0) {
    return {
      ok: true,
      summary: "No symbols found in this file",
      data: { symbols: [] },
    };
  }

  function flattenSymbols(
    symbols: LspDocumentSymbol[] | LspSymbolInformation[],
    container?: string,
  ): Array<{
    name: string;
    kind: string;
    line: number;
    container?: string;
  }> {
    const out: Array<{
      name: string;
      kind: string;
      line: number;
      container?: string;
    }> = [];

    for (const sym of symbols) {
      if ("range" in sym) {
        // DocumentSymbol (hierarchical)
        out.push({
          name: sym.name,
          kind: SYMBOL_KIND_NAMES[sym.kind] ?? `Kind(${sym.kind})`,
          line: sym.range.start.line + 1,
          container,
        });
        if (sym.children) {
          out.push(...flattenSymbols(sym.children, sym.name));
        }
      } else {
        // SymbolInformation (flat)
        out.push({
          name: sym.name,
          kind: SYMBOL_KIND_NAMES[sym.kind] ?? `Kind(${sym.kind})`,
          line: sym.location.range.start.line + 1,
          container: sym.containerName,
        });
      }
    }
    return out;
  }

  const symbols = flattenSymbols(result);

  return {
    ok: true,
    summary: `Found ${symbols.length} symbol(s) in ${filePath}`,
    data: { symbols },
  };
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export async function shutdownAllServers(): Promise<void> {
  for (const workspace of serverInstances.values()) {
    for (const entry of workspace.values()) {
      await entry.client.shutdown().catch(() => {});
    }
  }
  serverInstances.clear();
}
