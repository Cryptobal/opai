/**
 * GET/PUT /api/configuracion/knowledge
 *
 * Lectura y actualización de la configuración tenant-wide de Conocimiento.
 * Persiste en `Setting` con `category: "knowledge"`.
 *
 * Auditado en `AuditLog` (Ley 21.719) — registra before/after y campos cambiados.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";
import { getKnowledgeConfig, setKnowledgeConfig } from "@/lib/knowledge/config";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  recurringDefaultDays: z.number().int().min(1).max(365).optional(),
  dispatchHourCl: z.number().int().min(0).max(23).optional(),
  deadlineDays: z.number().int().min(1).max(365).optional(),
  reminderDays: z.number().int().min(0).max(365).optional(),
  emailEnabled: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "config", "conocimiento")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const data = await getKnowledgeConfig(ctx.tenantId);
  return NextResponse.json({ success: true, data });
}

export async function PUT(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "config", "conocimiento")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para editar" },
      { status: 403 },
    );
  }

  const { data, error } = await parseBody(request, updateSchema);
  if (error) return error;

  const before = await getKnowledgeConfig(ctx.tenantId);
  const after = await setKnowledgeConfig(ctx.tenantId, data);

  await logAudit({
    action: "UPDATE",
    entity: "KnowledgeConfig",
    entityId: ctx.tenantId,
    details: { before, after, changed: data },
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    request,
  });

  return NextResponse.json({ success: true, data: after });
}
