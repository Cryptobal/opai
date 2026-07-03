/**
 * Servidor MCP — endpoint con la key embebida en la ruta (`/api/mcp/<KEY>`).
 * Para clientes que NO permiten headers, como los custom connectors de
 * claude.ai. Converge en el mismo handler que la variante Bearer.
 */

import { handleMcpRequest, mcpOptions, mcpMethodNotAllowed } from "../handler";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  return handleMcpRequest(req, decodeURIComponent(key));
}

export async function GET(): Promise<Response> {
  return mcpMethodNotAllowed();
}

export async function OPTIONS(): Promise<Response> {
  return mcpOptions();
}
