import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";

const notesSchema = z.object({
  notes: z.string().max(2000).nullable(),  // null/empty borra la nota
});

/** POST /api/finance/cashflow/occurrences/[id]/notes
 *
 *  Actualiza la nota libre de una occurrence ya materializada. Funciona para
 *  cualquier source (CONTRACT, RECURRING_DTE, PAYROLL, MANUAL, etc.) — la nota
 *  es siempre editable porque es metadata del usuario, no del sistema.
 *
 *  Para borrar la nota: enviar { notes: null } o { notes: "" }. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const parsed = await parseBody(request, notesSchema);
    if (parsed.error) return parsed.error;

    // Verificar pertenencia al tenant antes de update (defensa multi-tenant)
    const occ = await prisma.financeCashflowOccurrence.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!occ) {
      return NextResponse.json({ success: false, error: "No encontrada" }, { status: 404 });
    }

    const cleaned = parsed.data.notes?.trim() ?? null;
    await prisma.financeCashflowOccurrence.update({
      where: { id },
      data: { notes: cleaned === "" ? null : cleaned },
    });
    return NextResponse.json({ success: true, notes: cleaned === "" ? null : cleaned });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST notes:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
