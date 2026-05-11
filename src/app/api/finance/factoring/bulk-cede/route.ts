/**
 * POST /api/finance/factoring/bulk-cede
 *
 * Cede N DTEs en un mismo batch (Fase 2 — cesión bulk). Cada DTE genera
 * su propio AEC vía el flow normal; el batch sólo agrupa para reporting
 * y prorratea costos por monto bruto. Tolera fallos parciales: si una
 * cesión individual falla, las otras siguen.
 *
 * Capability: facturacion_issue.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { bulkCedeSchema } from "@/lib/validations/factoring";
import { bulkCedeDtes } from "@/modules/finance/factoring/cession.service";

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_issue")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para cesiones de factoring" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, bulkCedeSchema);
  if (parsed.error) return parsed.error;

  try {
    const result = await bulkCedeDtes(
      {
        dteIds: parsed.data.dteIds,
        factoringCompanyId: parsed.data.factoringCompanyId,
        fechaCesion: parsed.data.fechaCesion,
        fechaVencimiento: parsed.data.fechaVencimiento,
        advanceRate: parsed.data.advanceRate,
        interestRate: parsed.data.interestRate,
        totals: parsed.data.totals ?? {},
        emailDeudor: parsed.data.emailDeudor || undefined,
        notes: parsed.data.notes,
        contactNombre: parsed.data.contactNombre,
        contactFono: parsed.data.contactFono,
        contactEmail: parsed.data.contactEmail || undefined,
        simulation: parsed.data.simulation,
      },
      { tenantId: ctx.tenantId, userId: ctx.userId },
    );
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error en cesión bulk",
      },
      { status: 400 },
    );
  }
}
