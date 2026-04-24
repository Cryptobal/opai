/**
 * Guard para rutas del Portal Colaborador (Portal Guardia) del módulo psych.
 * Reutiliza `requirePortalGuardiaAuth` (valida guardiaId contra DB y retorna
 * tenantId verificado).
 *
 * El colaborador solo puede acceder a SUS propios assessments. Todas las
 * queries deben filtrar estrictamente por `personaId` (la `OpsPersona`
 * asociada al `OpsGuardia`), nunca por tenantId solamente.
 *
 * Patrón de uso en endpoints:
 *   const guard = await guardPsychCollaborator(request);
 *   if (!guard.ok) return guard.response;
 *   const { personaId, tenantId } = guard.ctx;
 *   // prisma.psychAssessment.findMany({ where: { personaId, tenantId } })
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

export interface PsychCollaboratorCtx {
  guardiaId: string;
  personaId: string;
  tenantId: string;
}

export interface PsychCollaboratorGuardOk {
  ok: true;
  ctx: PsychCollaboratorCtx;
}

export interface PsychCollaboratorGuardDeny {
  ok: false;
  response: NextResponse;
}

export type PsychCollaboratorGuardResult =
  | PsychCollaboratorGuardOk
  | PsychCollaboratorGuardDeny;

function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: "No autorizado" },
    { status: 401 },
  );
}

export async function guardPsychCollaborator(
  request: NextRequest,
): Promise<PsychCollaboratorGuardResult> {
  const guardiaId =
    request.nextUrl.searchParams.get("guardiaId") ??
    request.headers.get("x-guardia-id") ??
    null;

  const auth = await requirePortalGuardiaAuth(guardiaId);
  if (!auth) return { ok: false, response: unauthorized() };

  // OpsGuardia → OpsPersona: necesitamos personaId para filtrar assessments.
  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: auth.guardiaId },
    select: { personaId: true },
  });
  if (!guardia?.personaId) return { ok: false, response: unauthorized() };

  return {
    ok: true,
    ctx: {
      guardiaId: auth.guardiaId,
      personaId: guardia.personaId,
      tenantId: auth.tenantId,
    },
  };
}
