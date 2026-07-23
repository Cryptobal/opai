/**
 * POST /api/crm/gmail/outbox/[id]/cancel — "Deshacer" dentro de la ventana o
 * cancelar un envío programado (PR-12). Solo aplica si el item aún no fue
 * reclamado por el despachador.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { cancelOutboxItem } from "@/modules/crm/email/email-outbox";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const result = await cancelOutboxItem({
    id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  if (!result.cancelled) {
    return NextResponse.json(
      { success: false, error: "El correo ya fue enviado o cancelado" },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true });
}
