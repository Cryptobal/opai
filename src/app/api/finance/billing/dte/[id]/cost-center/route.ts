/**
 * API Route: PATCH /api/finance/billing/dte/[id]/cost-center
 *
 * Asigna o cambia el centro de costo (cliente CRM + instalación) de un
 * DTE existente. Aplica para EMITIDOS y RECIBIDOS:
 *
 *   - EMITIDOS: el cliente CRM debería coincidir con receiverRut, pero
 *     el endpoint NO lo valida (puede haber facturas a un sub-cliente
 *     o a un destinatario distinto al cliente comercial).
 *   - RECIBIDOS: vincula la factura de proveedor a la instalación del
 *     cliente que asume el gasto (ej: factura de uniformes destinada a
 *     la instalación X del cliente Y).
 *
 * Body: { crmAccountId?: string|null, installationId?: string|null }
 * Pasar `null` desasigna el campo.
 *
 * Auth: requiere `facturacion_manage` (mismo que registrar DTE recibido).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  assignDteCostCenter,
  AssignDteCostCenterError,
} from "@/modules/finance/billing/dte-cost-center.service";

const bodySchema = z.object({
  crmAccountId: z.string().uuid().nullable().optional(),
  installationId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "facturacion_manage")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para editar centro de costo" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;

  // Validación + persistencia en el service compartido (mismo comportamiento;
  // reutilizado también desde el flujo de Slack).
  try {
    const updated = await assignDteCostCenter(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof AssignDteCostCenterError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === "NOT_FOUND" ? 404 : 400 },
      );
    }
    throw err;
  }
}
