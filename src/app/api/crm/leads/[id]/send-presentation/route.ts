/**
 * POST /api/crm/leads/[id]/send-presentation
 *
 * Envía la Presentación de Empresa del tenant a un LEAD (pre-aprobación).
 * Crea un prospecto liviano (cuenta prospect + contacto, sin deal/cotización)
 * y le habilita el acceso al portal del cliente para que viva el onboarding.
 *
 * Body: { notes?: string, cc?: string[], bcc?: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import {
  ensureProspectFromLead,
  EnsureProspectError,
} from "@/modules/crm/leads/ensure-prospect-from-lead";
import {
  sendCompanyPresentation,
  SendPresentationError,
} from "@/modules/crm/presentation/send-company-presentation";

function asEmailArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const notes = typeof body.notes === "string" ? body.notes.trim() || undefined : undefined;

    // 1. Prospecto liviano (idempotente): cuenta prospect + contacto.
    const prospect = await ensureProspectFromLead({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      leadId: id,
    });

    // 2. Enviar presentación al contacto del prospecto.
    const result = await sendCompanyPresentation({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      contactId: prospect.contactId,
      notes,
      cc: asEmailArray(body.cc),
      bcc: asEmailArray(body.bcc),
    });

    return NextResponse.json({
      success: true,
      accountId: prospect.accountId,
      contactId: prospect.contactId,
      ...result,
    });
  } catch (error) {
    if (error instanceof EnsureProspectError) {
      const status = error.code === "lead_not_found" ? 404 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    if (error instanceof SendPresentationError) {
      const status =
        error.code === "contact_not_found" ? 404 : error.code === "missing_email" ? 400 : 500;
      const dev = process.env.NODE_ENV === "development";
      return NextResponse.json(
        { success: false, error: dev || status !== 500 ? error.message : "Error enviando presentación" },
        { status },
      );
    }
    console.error("[CRM] leads/send-presentation:", error);
    const errMsg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development" ? errMsg : "Error interno enviando presentación",
      },
      { status: 500 },
    );
  }
}
