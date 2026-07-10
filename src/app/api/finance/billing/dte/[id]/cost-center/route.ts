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
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { cleanRut } from "@/lib/chile-rut";

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
  const dte = await prisma.financeDte.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, direction: true, receiverRut: true },
  });
  if (!dte) {
    return NextResponse.json(
      { success: false, error: "DTE no encontrado" },
      { status: 404 },
    );
  }

  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;
  const { crmAccountId, installationId } = parsed.data;

  // Si pasaron installationId, validamos que pertenezca al cliente
  // (si también pasaron crmAccountId) o al tenant.
  if (installationId) {
    const inst = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        tenantId: ctx.tenantId,
        ...(crmAccountId ? { accountId: crmAccountId } : {}),
      },
      select: { id: true },
    });
    if (!inst) {
      return NextResponse.json(
        {
          success: false,
          error: crmAccountId
            ? "Instalación no encontrada o no pertenece al cliente seleccionado"
            : "Instalación no encontrada",
        },
        { status: 400 },
      );
    }
  }

  // Si pasaron crmAccountId, validamos que exista en el tenant.
  // Para DTEs EMITIDOS, además exigimos que el RUT del cliente CRM coincida
  // con receiverRut del DTE: el centro de costo de una factura de venta
  // tiene que ser el mismo cliente al que se le facturó. Permitir mezclar
  // RUTs distintos rompe los reportes por cliente y la integridad fiscal.
  // Para DTEs RECIBIDOS no aplica (factura de proveedor X imputada al
  // cliente interno Y al que pertenece el gasto).
  if (crmAccountId) {
    const acc = await prisma.crmAccount.findFirst({
      where: { id: crmAccountId, tenantId: ctx.tenantId },
      select: { id: true, rut: true, name: true, legalName: true },
    });
    if (!acc) {
      return NextResponse.json(
        { success: false, error: "Cliente CRM no encontrado" },
        { status: 400 },
      );
    }
    if (dte.direction === "ISSUED") {
      // cleanRut normaliza a solo dígitos+K, tolerando caracteres
      // invisibles del XML SII (zero-width space, BOM, etc.) que de otro
      // modo harían fallar esta igualdad aunque el RUT se vea idéntico.
      const accRut = cleanRut(acc.rut ?? "");
      const dteRut = cleanRut(dte.receiverRut ?? "");
      if (!accRut || accRut !== dteRut) {
        return NextResponse.json(
          {
            success: false,
            error: `El RUT del cliente seleccionado (${acc.rut ?? "sin RUT"}) no coincide con el RUT del receptor del DTE (${dte.receiverRut}). Para facturas de venta el centro de costo debe ser el mismo cliente al que se facturó.`,
          },
          { status: 400 },
        );
      }
    }
  }

  // Update parcial: solo los campos que vinieron (undefined = no tocar).
  // null explícito = desasignar.
  const updateData: Record<string, unknown> = {};
  if (crmAccountId !== undefined) updateData.crmAccountId = crmAccountId;
  if (installationId !== undefined) updateData.installationId = installationId;

  // Si desasignan crmAccountId, también limpiamos installationId (no tiene
  // sentido tener instalación sin cliente).
  if (crmAccountId === null && installationId === undefined) {
    updateData.installationId = null;
  }

  const updated = await prisma.financeDte.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      crmAccountId: true,
      installationId: true,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
