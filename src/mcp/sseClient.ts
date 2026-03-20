import type { McpCallResult, McpToolDescriptor } from "./types.js";

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
}

export class McpSseClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private nextId = 1;
  private initialized = false;
  private messageEndpoint: string | null = null;

  constructor(
    private readonly serverName: string,
    url: string,
    env?: Record<string, string>,
  ) {
    this.baseUrl = url;
    this.headers = {
      "Content-Type": "application/json",
    };
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        if (key.endsWith("_TOKEN") || key.endsWith("_KEY")) {
          this.headers.Authorization = `Bearer ${value}`;
        }
      }
    }
  }

  async connect(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Discover the message endpoint via SSE
    try {
      const sseUrl = this.baseUrl.endsWith("/sse")
        ? this.baseUrl
        : `${this.baseUrl}/sse`;
      const sseResponse = await fetch(sseUrl, {
        headers: { Accept: "text/event-stream" },
        signal: AbortSignal.timeout(5000),
      });

      if (sseResponse.ok) {
        const text = await sseResponse.text();
        // Parse SSE endpoint event: "event: endpoint\ndata: /messages/..."
        const match = text.match(/data:\s*(.+)/);
        if (match) {
          this.messageEndpoint = match[1].trim();
        }
      }
    } catch {
      // SSE discovery failed — try direct /messages endpoint
    }

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "MooCode",
        version: "0.1.0",
      },
    });

    await this.notify("notifications/initialized", {});
    this.initialized = true;
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
    this.initialized = false;
  }

  private getEndpoint(method: string): string {
    if (this.messageEndpoint) {
      const base = this.baseUrl.replace(/\/sse$/, "");
      return `${base}${this.messageEndpoint}`;
    }
    // Fallback: try common endpoints
    if (method === "initialize") {
      return this.baseUrl.endsWith("/sse")
        ? this.baseUrl.replace("/sse", "/messages")
        : `${this.baseUrl}/messages`;
    }
    return this.baseUrl.endsWith("/sse")
      ? this.baseUrl.replace("/sse", "/messages")
      : `${this.baseUrl}/messages`;
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const endpoint = this.getEndpoint(method);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(
        `MCP SSE ${this.serverName}: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as JsonRpcResponse;
    if (data.error) {
      throw new Error(`MCP ${this.serverName}: ${data.error.message}`);
    }
    return data.result;
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const payload = {
      jsonrpc: "2.0",
      method,
      params,
    };

    try {
      const endpoint = this.getEndpoint(method);
      await fetch(endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Notifications are fire-and-forget
    }
  }
}
