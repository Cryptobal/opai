import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { issueDraftDte } from "@/modules/finance/billing/dte-draft.service";

const issueDraftSchema = z.object({
  autoSendEmail: z.boolean().optional(),
  sendXmlToBackoffice: z.boolean().optional(),
  backofficeEmailsOverride: z.array(z.string().email()).max(5).optional(),
  // Si el usuario quiere forzar una UF distinta a la del borrador / del día.
  ufOverride: z.number().positive().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    // Emitir un borrador requiere el permiso REAL de emisión, no basta
    // create_draft. Esto es deliberado: el draft es una zona de prueba,
    // emitirlo dispara obligaciones tributarias.
    const dteTypeAllowed = hasFacturacionCapability(perms, "facturacion_issue") ||
      hasFacturacionCapability(perms, "facturacion_credit_note");
    if (!dteTypeAllowed) {
      return NextResponse.json(
        { success: false, error: "Sin permiso para emitir DTE" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const parsed = await parseBody(request, issueDraftSchema);
    if (parsed.error) return parsed.error;

    const issued = await issueDraftDte(ctx.tenantId, id, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: issued }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing/Drafts] Issue error:", error);
    const message = error instanceof Error ? error.message : "Error al emitir borrador";
    const status = message.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
