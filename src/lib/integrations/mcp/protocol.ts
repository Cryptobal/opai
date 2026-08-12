/**
 * Servidor MCP (Fase 3) — JSON-RPC 2.0 + mapeo de tools.
 *
 * Protocolo implementado a mano (cero deps). MCP transporta JSON-RPC 2.0
 * sobre POST. Aquí van los tipos y helpers de respuesta + la conversión de
 * las definiciones estilo OpenAI (`{ name, description, parameters }`) al
 * formato MCP (`{ name, description, inputSchema }`).
 */

import type { getToolDefinitionsV2 } from "@/lib/ai/help-chat-tools-v2";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
// Versiones que aceptamos si el cliente las propone en `initialize`.
export const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);

// Códigos JSON-RPC estándar.
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

export interface McpToolAnnotations {
  /** true = la tool no persiste cambios (solo lectura). */
  readOnlyHint: boolean;
  /** true = puede eliminar o revertir datos de forma difícil de deshacer. */
  destructiveHint: boolean;
  /** false = opera solo sobre datos del tenant autenticado (no internet abierto). */
  openWorldHint: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations;
}

/** Tools cuyo nombre implica borrado masivo o eliminación de entidades. */
export const MCP_DESTRUCTIVE_TOOL_NAMES = new Set([
  "remove_quote_position",
  "bulk_update_installations",
]);

/** Garantiza un JSON Schema de objeto válido para `inputSchema`. */
function ensureObjectSchema(params: unknown): Record<string, unknown> {
  if (
    params &&
    typeof params === "object" &&
    (params as { type?: unknown }).type === "object"
  ) {
    return params as Record<string, unknown>;
  }
  return { type: "object", properties: {} };
}

type ToolDefs = ReturnType<typeof getToolDefinitionsV2>;

export interface ToMcpToolsOptions {
  /** Nombres de tools de escritura (resto = solo lectura). */
  writeToolNames?: ReadonlySet<string>;
}

/** Mapea las definiciones OpenAI-style a tools MCP con annotations para clientes. */
export function toMcpTools(defs: ToolDefs, options: ToMcpToolsOptions = {}): McpTool[] {
  const writes = options.writeToolNames;
  return defs.map((d) => {
    const name = d.function.name;
    const isWrite = writes?.has(name) ?? false;
    const isDestructive = MCP_DESTRUCTIVE_TOOL_NAMES.has(name);
    return {
      name,
      description: d.function.description,
      inputSchema: ensureObjectSchema(d.function.parameters),
      annotations: {
        readOnlyHint: !isWrite,
        destructiveHint: isWrite && isDestructive,
        openWorldHint: false,
      },
    };
  });
}

/** Mensaje JSON-RPC -32602 cuando el cliente invoca una tool fuera de su lista blanca. */
export function buildToolRejectionMessage(
  toolName: string,
  opts: {
    keyScope: "READ" | "READ_WRITE";
    allowWrites: boolean;
    isWriteTool: boolean;
    isListed: boolean;
  },
): string {
  if (!opts.isListed) {
    if (opts.isWriteTool && opts.keyScope === "READ") {
      return (
        `Tool "${toolName}" es de escritura y esta API key tiene scope READ. ` +
        "Crea una key READ_WRITE o usa una tool de solo lectura."
      );
    }
    if (opts.isWriteTool && opts.keyScope === "READ_WRITE" && !opts.allowWrites) {
      return (
        `Tool "${toolName}" es de escritura pero el tenant tiene deshabilitado ` +
        "allowWrites en Configuración → Asistente IA. Actívalo o usa una key READ."
      );
    }
    return `Tool "${toolName}" no está disponible para este scope o permisos del Admin creador.`;
  }
  return `Tool "${toolName}" no disponible.`;
}
