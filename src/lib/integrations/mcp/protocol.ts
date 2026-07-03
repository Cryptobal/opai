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

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

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

/** Mapea las definiciones OpenAI-style a tools MCP. */
export function toMcpTools(defs: ToolDefs): McpTool[] {
  return defs.map((d) => ({
    name: d.function.name,
    description: d.function.description,
    inputSchema: ensureObjectSchema(d.function.parameters),
  }));
}
