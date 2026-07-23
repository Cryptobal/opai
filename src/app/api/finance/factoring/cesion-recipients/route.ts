/**
 * POST /api/finance/factoring/cesion-recipients
 *
 * Resuelve, para uno o varios DTEs emitidos, los destinatarios del AVISO
 * de cesión al deudor: contactos CRM de la cuenta con `recibeCesion = true`.
 * Sólo lectura — lo usan los modales de cesión (individual y bulk) para
 * mostrar a quién se notificará antes de confirmar.
 *
 * Seguridad: los DTEs se cargan filtrando por tenantId; la resolución de
 * contactos filtra por tenantId + accountId juntos. Nunca se retornan
 * contactos de otra cuenta ni de otro tenant.
 *
 * Capability: facturacion_issue (mismo scope que cedeDte / bulk-cede).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cesionRecipientsSchema } from "@/lib/validations/factoring";
import { resolveCesionRecipients } from "@/modules/finance/factoring/cesion-recipients.service";

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

  const parsed = await parseBody(request, cesionRecipientsSchema);
  if (parsed.error) return parsed.error;

  const dtes = await prisma.financeDte.findMany({
    where: {
      id: { in: parsed.data.dteIds },
      tenantId: ctx.tenantId,
      direction: "ISSUED",
    },
    select: { id: true, accountId: true },
  });

  const recipients: Record<
    string,
    { emails: string[]; notificarDeudor: boolean; reason: string; hasAccount: boolean }
  > = {};
  for (const dte of dtes) {
    const r = await resolveCesionRecipients(ctx.tenantId, { accountId: dte.accountId });
    recipients[dte.id] = {
      emails: r.emails,
      notificarDeudor: r.notificarDeudor,
      reason: r.reason,
      hasAccount: dte.accountId != null,
    };
  }

  return NextResponse.json({ success: true, recipients });
}
