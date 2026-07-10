/**
 * Servicio: asignar/cambiar el centro de costo (cliente CRM + instalación) de
 * un DTE. Extraído del endpoint `PATCH /api/finance/billing/dte/[id]/cost-center`
 * para reusar la MISMA validación desde la web y desde Slack sin duplicar.
 *
 * Aplica a EMITIDOS y RECIBIDOS:
 *   - EMITIDOS: el RUT del cliente CRM debe coincidir con `receiverRut` del DTE
 *     (integridad fiscal de facturas de venta).
 *   - RECIBIDOS: no valida RUT (factura de proveedor imputada al cliente/gasto).
 *
 * `installationId` apunta a CrmInstallation. Pasar `null` desasigna el campo.
 * SIEMPRE revalida contra `tenantId` (frontera multi-tenant).
 */

import { prisma } from "@/lib/prisma";

export class AssignDteCostCenterError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "INVALID",
  ) {
    super(message);
    this.name = "AssignDteCostCenterError";
  }
}

export interface AssignDteCostCenterInput {
  crmAccountId?: string | null;
  installationId?: string | null;
}

export interface AssignDteCostCenterResult {
  id: string;
  crmAccountId: string | null;
  installationId: string | null;
}

export async function assignDteCostCenter(
  tenantId: string,
  dteId: string,
  input: AssignDteCostCenterInput,
): Promise<AssignDteCostCenterResult> {
  const { crmAccountId, installationId } = input;

  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: { id: true, direction: true, receiverRut: true },
  });
  if (!dte) throw new AssignDteCostCenterError("DTE no encontrado", "NOT_FOUND");

  // Instalación: si se pasó, debe pertenecer al cliente (si también se pasó) o
  // al tenant.
  if (installationId) {
    const inst = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        tenantId,
        ...(crmAccountId ? { accountId: crmAccountId } : {}),
      },
      select: { id: true },
    });
    if (!inst) {
      throw new AssignDteCostCenterError(
        crmAccountId
          ? "Instalación no encontrada o no pertenece al cliente seleccionado"
          : "Instalación no encontrada",
        "INVALID",
      );
    }
  }

  // Cliente: debe existir en el tenant. Para EMITIDOS, además el RUT debe
  // coincidir con receiverRut del DTE.
  if (crmAccountId) {
    const acc = await prisma.crmAccount.findFirst({
      where: { id: crmAccountId, tenantId },
      select: { id: true, rut: true },
    });
    if (!acc) throw new AssignDteCostCenterError("Cliente CRM no encontrado", "INVALID");
    if (dte.direction === "ISSUED") {
      const normalize = (v: string | null | undefined) =>
        (v ?? "").replace(/[.\-\s]/g, "").toUpperCase();
      const accRut = normalize(acc.rut);
      const dteRut = normalize(dte.receiverRut);
      if (!accRut || accRut !== dteRut) {
        throw new AssignDteCostCenterError(
          `El RUT del cliente seleccionado (${acc.rut ?? "sin RUT"}) no coincide con el RUT del receptor del DTE (${dte.receiverRut}). Para facturas de venta el centro de costo debe ser el mismo cliente al que se facturó.`,
          "INVALID",
        );
      }
    }
  }

  // Update parcial: solo los campos que vinieron (undefined = no tocar).
  // null explícito = desasignar. Desasignar el cliente limpia la instalación.
  const updateData: { crmAccountId?: string | null; installationId?: string | null } = {};
  if (crmAccountId !== undefined) updateData.crmAccountId = crmAccountId;
  if (installationId !== undefined) updateData.installationId = installationId;
  if (crmAccountId === null && installationId === undefined) {
    updateData.installationId = null;
  }

  const updated = await prisma.financeDte.update({
    where: { id: dteId },
    data: updateData,
    select: { id: true, crmAccountId: true, installationId: true },
  });
  return updated;
}
