/**
 * Gestión de API keys del servidor MCP (por tenant).
 * requireIntegrationAdmin (sesión + rol owner|admin). Permanece tras NextAuth.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireIntegrationAdmin } from "@/lib/integrations/guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { generateMcpKey } from "@/lib/integrations/mcp/keys";

export const dynamic = "force-dynamic";

const SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  scope: true,
  lastUsedAt: true,
  createdAt: true,
  revokedAt: true,
} as const;

export async function GET() {
  const auth = await requireIntegrationAdmin("el servidor MCP");
  if (auth.error) return auth.error;
  const keys = await prisma.mcpApiKey.findMany({
    where: { tenantId: auth.ctx.tenantId },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return NextResponse.json({ success: true, keys });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(80),
  scope: z.enum(["READ", "READ_WRITE"]).default("READ"),
});

export async function POST(req: Request) {
  const auth = await requireIntegrationAdmin("el servidor MCP");
  if (auth.error) return auth.error;
  const { tenantId, userId } = auth.ctx;

  let input: z.infer<typeof createSchema>;
  try {
    input = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
  }

  const { plainKey, keyHash, keyPrefix } = generateMcpKey();
  const key = await prisma.mcpApiKey.create({
    data: {
      tenantId,
      name: input.name,
      keyHash,
      keyPrefix,
      scope: input.scope,
      createdByAdminId: userId,
    },
    select: SELECT,
  });

  await logAudit({
    action: "CREATE",
    entity: "McpApiKey",
    entityId: key.id,
    tenantId,
    userId,
    details: { source: "mcp_admin", scope: input.scope, name: input.name },
    request: req,
  });

  // plainKey se devuelve UNA sola vez: no se vuelve a poder recuperar.
  return NextResponse.json({ success: true, key, plainKey });
}

export async function DELETE(req: Request) {
  const auth = await requireIntegrationAdmin("el servidor MCP");
  if (auth.error) return auth.error;
  const { tenantId, userId } = auth.ctx;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Falta id" }, { status: 400 });

  const res = await prisma.mcpApiKey.updateMany({
    where: { id, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) {
    return NextResponse.json({ success: false, error: "Key no encontrada" }, { status: 404 });
  }

  await logAudit({
    action: "DELETE",
    entity: "McpApiKey",
    entityId: id,
    tenantId,
    userId,
    details: { source: "mcp_admin", reason: "revoked_by_admin" },
    request: req,
  });

  return NextResponse.json({ success: true });
}
