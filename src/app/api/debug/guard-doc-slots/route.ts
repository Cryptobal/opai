/**
 * Debug endpoint — Inspect the guard document slots for the current tenant.
 *
 * GET /api/debug/guard-doc-slots
 *
 * Authenticated. Returns:
 *   - The DB rows in `ops.tipos_doc_operacional` (capa = "guardia")
 *   - The slot list produced by `getOperationalGuardDocSlots`
 *   - A focused diagnostic for `certificado_os10` (DB row + slot)
 *   - A summary boolean indicating whether the slot is visible
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getOperationalGuardDocSlots } from "@/lib/operational-guard-doc-slots";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const dbTipos = await prisma.tipoDocOperacional.findMany({
    where: { tenantId: ctx.tenantId, capa: "guardia" },
    orderBy: { order: "asc" },
  });

  const slots = await getOperationalGuardDocSlots(ctx.tenantId);

  const certificadoInDb = dbTipos.find((t) => t.codigo === "certificado_os10") ?? null;
  const certificadoInSlots = slots.find((s) => s.codigo === "certificado_os10") ?? null;
  const credencialInDb = dbTipos.find((t) => t.codigo === "credencial_os10") ?? null;
  const credencialInSlots = slots.find((s) => s.codigo === "credencial_os10") ?? null;

  return NextResponse.json({
    tenantId: ctx.tenantId,
    userEmail: ctx.userEmail,
    dbTipos,
    slots,
    os10Diagnostic: {
      certificado_os10_in_db: certificadoInDb,
      certificado_os10_in_slots: certificadoInSlots,
      credencial_os10_in_db: credencialInDb,
      credencial_os10_in_slots: credencialInSlots,
    },
    summary: {
      certificado_os10_visible: certificadoInSlots !== null,
      credencial_os10_visible: credencialInSlots !== null,
      total_db_rows: dbTipos.length,
      total_slots: slots.length,
    },
  });
}
