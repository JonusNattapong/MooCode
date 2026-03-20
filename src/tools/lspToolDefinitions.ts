import type { McpToolDefinition } from "../types.js";

export const LSP_TOOLS: McpToolDefinition[] = [
  {
    name: "goToDefinition",
    description:
      "Find where a symbol is DEFINED. Given a file path, line, and character position (1-based), returns the location(s) where the symbol at that position is defined. Use this instead of grep when you need precise 'Go to Definition' results — understands imports, re-exports, overloads, and language-specific scoping rules.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the source file",
        },
        line: {
          type: "number",
          description: "Line number (1-based)",
        },
        character: {
          type: "number",
          description: "Character/column number (1-based)",
        },
      },
      required: ["filePath", "line", "character"],
    },
    server: "lsp",
  },
  {
    name: "findReferences",
    description:
      "Find all places where a symbol is USED/REFERENCED. Given a file path, line, and character position (1-based), returns all locations that reference the symbol. Use this instead of grep when you need precise 'Find References' results — understands type hierarchy, method overrides, and re-exports.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the source file",
        },
        line: {
          type: "number",
          description: "Line number (1-based)",
        },
        character: {
          type: "number",
          description: "Character/column number (1-based)",
        },
        includeDeclaration: {
          type: "boolean",
          description:
            "Whether to include the declaration itself in results (default: true)",
        },
      },
      required: ["filePath", "line", "character"],
    },
    server: "lsp",
  },
  {
    name: "hover",
    description:
      "Get type information and documentation for the symbol at a given position. Returns the inferred type, docstring, and signature for functions/methods. Use this to understand what a variable, function, or type is without reading the full definition file.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the source file",
        },
        line: {
          type: "number",
          description: "Line number (1-based)",
        },
        character: {
          type: "number",
          description: "Character/column number (1-based)",
        },
      },
      required: ["filePath", "line", "character"],
    },
    server: "lsp",
  },
  {
    name: "documentSymbols",
    description:
      "List all symbols (functions, classes, interfaces, variables, etc.) defined in a file with their types and line numbers. Use this to quickly understand the structure of a file without reading its entire content.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the source file",
        },
      },
      required: ["filePath"],
    },
    server: "lsp",
  },
];
