/**
 * Servidor MCP — endpoint con auth por header `Authorization: Bearer opai_mcp_...`.
 * Para clientes que sí permiten headers (Claude Code, clientes MCP genéricos).
 */

import { handleMcpRequest, mcpOptions, mcpMethodNotAllowed } from "./handler";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const authz = req.headers.get("authorization") ?? "";
  const key = authz.startsWith("Bearer ") ? authz.slice(7).trim() : null;
  return handleMcpRequest(req, key);
}

export async function GET(): Promise<Response> {
  return mcpMethodNotAllowed();
}

export async function OPTIONS(): Promise<Response> {
  return mcpOptions();
}
