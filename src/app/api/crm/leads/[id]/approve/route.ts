/**
 * API Route: /api/crm/leads/[id]/approve
 * POST - Aprobar prospecto y convertir a cuenta + contacto + negocio + instalaciones.
 * - Cuenta/contacto/instalaciones solo se crean aquí (no al crear el lead).
 * - checkDuplicates: true devuelve cuentas con mismo nombre, contacto con mismo email e instalaciones duplicadas.
 * - Resoluciones: useExistingAccountId, contactResolution + contactId, por instalación useExistingInstallationId.
 *
 * La lógica de creación vive en `@/lib/crm-lead-quote-engine` (extraída sin
 * cambios de comportamiento, Fase 15 B2) para poder reusarla desde el cockpit de
 * Slack. Este route solo parsea el body, resuelve auth y mapea el resultado
 * discriminado a la MISMA respuesta HTTP de siempre.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { approveLeadToEntities } from "@/lib/crm-lead-quote-engine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const result = await approveLeadToEntities({ tenantId: ctx.tenantId, userId: ctx.userId, leadId: id, body });

    switch (result.kind) {
      case "not_found":
        return NextResponse.json({ success: false, error: "Lead no encontrado" }, { status: 404 });
      case "already_approved":
        return NextResponse.json({ success: false, error: "Lead ya aprobado" }, { status: 400 });
      case "no_pipeline":
        return NextResponse.json({ success: false, error: "No hay etapas de pipeline configuradas" }, { status: 400 });
      case "duplicates":
        return NextResponse.json({
          success: true,
          duplicates: result.duplicates,
          existingContact: result.existingContact,
          installationConflicts: result.installationConflicts,
          message: result.message,
        });
      case "conflict_installation":
        return NextResponse.json(
          {
            success: false,
            error: "Conflicto de instalación",
            conflict: "installation",
            installationName: result.installationName,
            existingId: result.existingId,
          },
          { status: 409 }
        );
      case "bad_request":
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      case "tx_aborted":
        return NextResponse.json({ success: false, error: result.error }, { status: 500 });
      case "error":
        return NextResponse.json({ success: false, error: result.error }, { status: 500 });
      case "ok":
        return NextResponse.json({ success: true, data: result.data });
    }
  } catch (error) {
    console.error("Error approving CRM lead:", error);
    const msg = error instanceof Error ? error.message : "";
    return NextResponse.json({ success: false, error: msg || "Error al aprobar el lead" }, { status: 500 });
  }
}
