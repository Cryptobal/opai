/**
 * Servidor MCP (Fase 3) — handler JSON-RPC 2.0 sobre Streamable HTTP stateless.
 *
 * Compartido por `/api/mcp` (auth Bearer) y `/api/mcp/[key]` (key en la ruta).
 * La key ES el tenant: nunca se acepta tenantId por parámetro. Métodos:
 * initialize, notifications/*, ping, tools/list, tools/call. Todo lo demás
 * → -32601. GET → 405. Sin Mcp-Session-Id (stateless).
 */

import { after } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { resolveMcpKey, touchLastUsed } from "@/lib/integrations/mcp/keys";
import {
  buildMcpExecutionContext,
  McpInvalidKeyError,
} from "@/lib/integrations/mcp/context";
import { getToolDefinitionsV2, executeToolCallV2 } from "@/lib/ai/help-chat-tools-v2";
import {
  rpcResult,
  rpcError,
  toMcpTools,
  MCP_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  RPC_PARSE_ERROR,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_INVALID_PARAMS,
  RPC_INTERNAL_ERROR,
  type JsonRpcRequest,
  type JsonRpcId,
} from "@/lib/integrations/mcp/protocol";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const JSON_HEADERS = { "Content-Type": "application/json", ...CORS_HEADERS };

// Nombres de tools de escritura = las que sólo aparecen con allowWrites=true.
const READ_NAMES = new Set(getToolDefinitionsV2(true, false).map((d) => d.function.name));
const WRITE_NAMES = new Set(
  getToolDefinitionsV2(true, true).map((d) => d.function.name).filter((n) => !READ_NAMES.has(n)),
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function mcpOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function mcpMethodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...JSON_HEADERS, Allow: "POST" },
  });
}

function auditAction(name: string): "CREATE" | "UPDATE" | "DELETE" {
  if (name.startsWith("create")) return "CREATE";
  if (name.startsWith("remove") || name.startsWith("delete")) return "DELETE";
  return "UPDATE";
}

export async function handleMcpRequest(req: Request, plainKey: string | null): Promise<Response> {
  // 1. Rate limit por key (in-memory, tolerante a cold starts).
  const rl = checkRateLimit(`mcp:${plainKey ?? "anon"}`, { limit: 120, windowSeconds: 60 });
  if (!rl.allowed) return json({ error: "rate_limited" }, 429);

  // 2. Resolver la key → tenant/scope/admin.
  const key = await resolveMcpKey(plainKey);
  if (!key) return json({ error: "invalid_api_key" }, 401);

  // 3. Parsear body JSON-RPC.
  let body: JsonRpcRequest;
  try {
    const raw = await req.json();
    if (Array.isArray(raw)) {
      return json(rpcError(null, RPC_INVALID_REQUEST, "Batch requests no soportados."));
    }
    body = raw as JsonRpcRequest;
  } catch {
    return json(rpcError(null, RPC_PARSE_ERROR, "JSON inválido."));
  }

  const method = body.method ?? "";
  // Notificaciones (sin id) no llevan respuesta → 202.
  if (body.id === undefined) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  const id: JsonRpcId = body.id;

  try {
    if (method === "initialize") {
      const clientV = (body.params as { protocolVersion?: string } | undefined)?.protocolVersion;
      const protocolVersion =
        clientV && SUPPORTED_PROTOCOL_VERSIONS.has(clientV) ? clientV : MCP_PROTOCOL_VERSION;
      return json(
        rpcResult(id, {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "opai", version: "1.0.0" },
        }),
      );
    }

    if (method === "ping") return json(rpcResult(id, {}));

    if (method === "tools/list") {
      const ctx = await buildMcpExecutionContext(key);
      after(() => touchLastUsed(key.keyId));
      return json(rpcResult(id, { tools: toMcpTools(getToolDefinitionsV2(true, ctx.allowWrites)) }));
    }

    if (method === "tools/call") {
      const params = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const name = params?.name ?? "";
      const args = params?.arguments ?? {};
      const ctx = await buildMcpExecutionContext(key);
      after(() => touchLastUsed(key.keyId));

      // Lista blanca calculada según el scope efectivo — NO confiar en el nombre.
      const allowed = getToolDefinitionsV2(true, ctx.allowWrites);
      if (!allowed.some((d) => d.function.name === name)) {
        return json(rpcError(id, RPC_INVALID_PARAMS, `Tool "${name}" no disponible para este scope.`));
      }

      try {
        const result = await executeToolCallV2(
          name, args, ctx.tenantId, ctx.adminId, ctx.perms, ctx.canViewAllRendiciones, null,
        );
        if (WRITE_NAMES.has(name)) {
          after(() =>
            logAudit({
              action: auditAction(name),
              entity: "McpToolCall",
              entityId: name,
              tenantId: ctx.tenantId,
              userId: ctx.adminId,
              details: { source: "mcp", tool: name, keyPrefix: plainKey?.slice(0, 12) },
              request: req,
            }),
          );
        }
        return json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido.";
        return json(
          rpcResult(id, { content: [{ type: "text", text: `Error ejecutando ${name}: ${msg}` }], isError: true }),
        );
      }
    }

    return json(rpcError(id, RPC_METHOD_NOT_FOUND, `Método no soportado: ${method}`));
  } catch (err) {
    if (err instanceof McpInvalidKeyError) return json({ error: "invalid_api_key" }, 401);
    console.error("[mcp] handler error", err);
    return json(rpcError(id, RPC_INTERNAL_ERROR, "Error interno del servidor MCP."));
  }
}
