/**
 * Guard para rutas del Portal Cliente del módulo psych.
 * Reutiliza `requirePortalClienteAuth` (cookie portal_cliente_session).
 *
 * NO chequea `isTenantModuleEnabled('psych')` — la visibilidad la resuelve
 * cada endpoint consultando `ClientContractPsychConfig` por contractId.
 * Si un contrato no tiene config, el endpoint retorna vacío silenciosamente
 * (es lo correcto para preservar la lógica de "cliente no sabe qué módulos
 * tiene su proveedor").
 *
 * En este repo el término "contrato del cliente" mapea a `CrmInstallation.id`.
 * Exponemos el tipo como `contractIds[]` para alinearse con el modelo
 * `ClientContractPsychConfig.contractId`, pero internamente viene de
 * `installationIds` del auth helper del portal cliente.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

export interface PsychClientCtx {
  clientId: string; // contactId del portal cliente
  accountId: string;
  tenantId: string;
  contractIds: string[]; // = installationIds del cliente autenticado
  contactName: string;
  email: string | null;
}

export interface PsychClientGuardOk {
  ok: true;
  ctx: PsychClientCtx;
}

export interface PsychClientGuardDeny {
  ok: false;
  response: NextResponse;
}

export type PsychClientGuardResult =
  | PsychClientGuardOk
  | PsychClientGuardDeny;

function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: "No autorizado" },
    { status: 401 },
  );
}

export async function guardPsychClient(
  request?: NextRequest,
): Promise<PsychClientGuardResult> {
  const auth = await requirePortalClienteAuth(request);
  if (!auth) return { ok: false, response: unauthorized() };

  return {
    ok: true,
    ctx: {
      clientId: auth.contactId,
      accountId: auth.accountId,
      tenantId: auth.tenantId,
      contractIds: auth.installationIds,
      contactName: auth.contactName,
      email: auth.email,
    },
  };
}
