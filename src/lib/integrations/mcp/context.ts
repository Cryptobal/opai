/**
 * Servidor MCP (Fase 3) — contexto de ejecución de una key.
 *
 * La key define el tenant y el Admin creador. Las tools corren con los
 * permisos de ese Admin (resolvePermissionsById). Si el Admin fue desactivado
 * la key se trata como inválida. `allowWrites` combina el scope de la key con
 * el flag `allowWrites` del tenant (getAiHelpChatConfig): READ nunca escribe.
 */

import { prisma } from "@/lib/prisma";
import { resolvePermissionsById } from "@/lib/permissions-server";
import { hasCapability, type RolePermissions } from "@/lib/permissions";
import { getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import type { ResolvedMcpKey } from "./keys";

/** Error de key inválida (Admin desactivado / no encontrado) → 401 en el handler. */
export class McpInvalidKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpInvalidKeyError";
  }
}

export interface McpExecutionContext {
  tenantId: string;
  adminId: string;
  perms: RolePermissions;
  canViewAllRendiciones: boolean;
  allowWrites: boolean;
}

export async function buildMcpExecutionContext(
  key: ResolvedMcpKey,
): Promise<McpExecutionContext> {
  const admin = await prisma.admin.findUnique({
    where: { id: key.adminId },
    select: { id: true, status: true, tenantId: true },
  });

  if (!admin || admin.status !== "active" || admin.tenantId !== key.tenantId) {
    throw new McpInvalidKeyError(
      "El administrador dueño de esta API key ya no está activo. Revoca la key y crea una nueva.",
    );
  }

  const perms = await resolvePermissionsById(key.adminId);
  const cfg = await getAiHelpChatConfig(key.tenantId);

  return {
    tenantId: key.tenantId,
    adminId: key.adminId,
    perms,
    canViewAllRendiciones: hasCapability(perms, "rendicion_view_all"),
    // READ nunca escribe; READ_WRITE respeta además el flag del tenant.
    allowWrites: key.scope === "READ_WRITE" && cfg.allowWrites,
  };
}
