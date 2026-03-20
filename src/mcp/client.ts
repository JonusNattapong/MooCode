import { execa } from "execa";
import type {
  McpCallResult,
  McpStdioServerConfig,
  McpToolDescriptor,
} from "./types.js";

// Use a type alias for the execa process to avoid direct import issues in different versions
type McpProcess = ReturnType<typeof execa>;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  method?: string;
  params?: unknown;
}

export class McpClient {
  private process: McpProcess | null = null;
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(
    private readonly serverName: string,
    private readonly config: McpStdioServerConfig,
    private readonly cwd: string,
  ) {}

  async connect(): Promise<void> {
    if (this.process) {
      return;
    }

    this.process = execa(this.config.command, this.config.args ?? [], {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.config.env,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const proc = this.process;

    if (!proc.stdin || !proc.stdout) {
      throw new Error(`Failed to initialize MCP server pipes for '${this.serverName}'`);
    }

    proc.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    
    // Log stderr for debugging if needed, but don't let it crash us
    proc.stderr?.on("data", (chunk: Buffer) => {
      // console.error(`[MCP:${this.serverName}] ${chunk.toString()}`);
    });

    proc.on("exit", (code: number | null, signal: string | null) => {
      const error = new Error(
        `MCP server '${this.serverName}' exited unexpectedly (code: ${code}, signal: ${signal})`,
      );
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.process = null;
    });

    proc.catch((err: Error) => {
      const error = new Error(`MCP server '${this.serverName}' error: ${err.message}`);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.process = null;
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "MooCode",
        version: "0.1.0",
      },
    });
    this.notify("notifications/initialized", {});
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    await this.connect();
    const result = (await this.request("tools/list")) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: unknown;
      }>;
    };
    return (result.tools ?? []).map((tool) => ({
      server: this.serverName,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<McpCallResult> {
    await this.connect();
    const result = (await this.request("tools/call", {
      name: tool,
      arguments: args,
    })) as { content?: unknown; isError?: boolean };
    return {
      server: this.serverName,
      tool,
      content: result.content ?? result,
      isError: result.isError,
    };
  }

  async close(): Promise<void> {
    if (!this.process) {
      return;
    }
    this.process.kill();
    this.process = null;
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error(`MCP server '${this.serverName}' is not connected`);
    }

    const id = this.nextId++;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const headers = Buffer.from(
      `Content-Length: ${body.length}\r\n\r\n`,
      "utf8",
    );
    this.process.stdin.write(Buffer.concat([headers, body]));

    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  private notify(method: string, params?: unknown): void {
    if (!this.process || !this.process.stdin) {
      return;
    }
    const payload = {
      jsonrpc: "2.0",
      method,
      params,
    };
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const headers = Buffer.from(
      `Content-Length: ${body.length}\r\n\r\n`,
      "utf8",
    );
    this.process.stdin.write(Buffer.concat([headers, body]));
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        throw new Error(
          `Invalid MCP response from '${this.serverName}': missing Content-Length`,
        );
      }

      const contentLength = Number.parseInt(match[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) {
        return;
      }

      const messageText = this.buffer
        .slice(messageStart, messageEnd)
        .toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);
      this.handleMessage(JSON.parse(messageText) as JsonRpcResponse);
    }
  }

  private handleMessage(message: JsonRpcResponse): void {
    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(
        new Error(`MCP ${this.serverName}: ${message.error.message}`),
      );
      return;
    }

    pending.resolve(message.result);
  }
}

