/**
 * POST /api/integrations/slack/deal-room/refresh
 * Botón "Actualizar sala": reenvía al canal la info del negocio (ficha viva +
 * resumen de la cotización + Canvas de Inicio). Requiere módulo CRM + permiso de
 * edición de negocios (mismo gate que abrir la sala). Best-effort en cada parte.
 */

import { NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { resendDealRoomInfo } from "@/lib/integrations/slack/deal-rooms/room";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const auth = await requireTenantModule("crm");
  if (!auth.authorized) return auth.response;
  const editErr = await requireCrmEdit(auth.ctx, "deals");
  if (editErr) return editErr;

  let dealId = "";
  try {
    const body = (await req.json()) as { dealId?: string };
    dealId = body.dealId ?? "";
  } catch {
    /* body inválido → 400 abajo */
  }
  if (!dealId) return NextResponse.json({ success: false, error: "Falta dealId." }, { status: 400 });

  const r = await resendDealRoomInfo(auth.ctx.tenantId, dealId);
  if (!r.ok) return NextResponse.json({ success: false, error: r.message }, { status: 400 });
  return NextResponse.json({ success: true, message: r.message });
}
