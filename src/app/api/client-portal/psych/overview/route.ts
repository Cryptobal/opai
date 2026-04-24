/**
 * GET /api/client-portal/psych/overview
 *
 * Retorna, para cada contrato (= CrmInstallation) del cliente autenticado,
 * cobertura de evaluación psicolaboral con visibilidad según reportLevel.
 *
 * Respuesta por contrato:
 * - reportLevel: SEAL | SUMMARY | FULL (FULL degrada a SEAL si dpaSignedAt es null)
 * - coverage: totales agregados.
 * - assignedGuards: lista de guardias asignados con info anónima (solo nombre
 *   sanitizado + fechas); nunca score/banda/alertas aquí.
 * - distribution: solo si SUMMARY; conteos por banda sin nombres.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPsychClient } from "@/lib/psych/client-guard";
import { sanitizeGuardName } from "@/lib/portal-cliente";
import { resolveTenantPsychConfig } from "@/lib/psych/scoring/config";
import { buildContractOverview } from "@/lib/psych/client-overview";

export async function GET(req: NextRequest) {
  const guard = await guardPsychClient(req);
  if (!guard.ok) return guard.response;
  const { tenantId, contractIds } = guard.ctx;

  if (contractIds.length === 0) {
    return NextResponse.json({ success: true, contracts: [] });
  }

  const tenantCfg = await resolveTenantPsychConfig(tenantId);
  const configs = await prisma.clientContractPsychConfig.findMany({
    where: { tenantId, contractId: { in: contractIds } },
  });
  const configByContract = new Map(configs.map((c) => [c.contractId, c]));

  const guardsByInstallation = await prisma.opsGuardia.findMany({
    where: {
      tenantId,
      currentInstallationId: { in: contractIds },
      status: "active",
    },
    select: {
      id: true,
      personaId: true,
      currentInstallationId: true,
      persona: { select: { firstName: true, lastName: true } },
    },
  });

  const personaIds = guardsByInstallation
    .map((g) => g.personaId)
    .filter((p): p is string => !!p);

  const assessments = personaIds.length
    ? await prisma.psychAssessment.findMany({
        where: {
          tenantId,
          personaId: { in: personaIds },
          status: { in: ["SCORED", "REVIEWED"] },
        },
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          personaId: true,
          submittedAt: true,
          result: { select: { band: true } },
        },
      })
    : [];

  const lastByPersona = new Map<string, (typeof assessments)[number]>();
  for (const a of assessments) {
    if (a.personaId && !lastByPersona.has(a.personaId)) {
      lastByPersona.set(a.personaId, a);
    }
  }

  const contracts = contractIds.map((contractId) =>
    buildContractOverview({
      contractId,
      config: configByContract.get(contractId) ?? null,
      tenantCfg,
      guards: guardsByInstallation.filter((g) => g.currentInstallationId === contractId),
      lastByPersona,
      sanitizeGuardName,
    }),
  );

  return NextResponse.json({ success: true, contracts });
}
