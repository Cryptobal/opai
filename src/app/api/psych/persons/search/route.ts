/**
 * GET /api/psych/persons/search?q=XXX&type=all|guardia|postulante&limit=10
 *
 * Busca personas (guardias activos y/o postulantes ATS) del tenant por
 * nombre completo o RUT. Retorna lista unificada con metadata útil para
 * el selector de "Nueva evaluación".
 *
 * - kind='guardia'   → OpsGuardia con lifecycleStatus='contratado' | status='active'
 * - kind='postulante'→ OpsGuardia con lifecycleStatus IN (postulante, seleccionado)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPsych } from "@/lib/psych/api-guard";

const TYPES = new Set(["all", "guardia", "postulante"]);

export interface PersonSearchResult {
  id: string; // personaId
  guardiaId: string;
  kind: "guardia" | "postulante";
  displayName: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  subtitle: string;
  lastAssessmentAt: string | null;
}

const GUARDIA_ACTIVE_STATUSES = ["contratado"];
const POSTULANTE_STATUSES = ["postulante", "seleccionado"];

export async function GET(req: NextRequest) {
  const guard = await guardPsych("write");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.ctx;

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const type = sp.get("type") ?? "all";
  const limit = Math.min(20, Math.max(1, Number(sp.get("limit") ?? 10)));

  if (q.length < 2) {
    return NextResponse.json({ success: true, results: [] });
  }
  if (!TYPES.has(type)) {
    return NextResponse.json(
      { success: false, error: "type inválido (all|guardia|postulante)" },
      { status: 400 },
    );
  }

  const qNorm = q.replace(/[.\s-]/g, "");
  const where = {
    tenantId,
    OR: [
      { firstName: { contains: q, mode: "insensitive" as const } },
      { lastName: { contains: q, mode: "insensitive" as const } },
      { rut: { contains: qNorm, mode: "insensitive" as const } },
    ],
    guardia: {
      isNot: null,
    },
  };

  const personas = await prisma.opsPersona.findMany({
    where,
    take: limit,
    orderBy: { firstName: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rut: true,
      email: true,
      phone: true,
      phoneMobile: true,
      guardia: {
        select: {
          id: true,
          lifecycleStatus: true,
          status: true,
          currentInstallation: { select: { name: true } },
        },
      },
    },
  });

  const personaIds = personas.map((p) => p.id);
  const lastAssessments = personaIds.length
    ? await prisma.psychAssessment.findMany({
        where: { tenantId, personaId: { in: personaIds } },
        orderBy: { createdAt: "desc" },
        select: { personaId: true, createdAt: true },
      })
    : [];
  const lastByPersona = new Map<string, Date>();
  for (const a of lastAssessments) {
    if (a.personaId && !lastByPersona.has(a.personaId)) {
      lastByPersona.set(a.personaId, a.createdAt);
    }
  }

  const results: PersonSearchResult[] = [];
  for (const p of personas) {
    if (!p.guardia) continue;
    const isActive = GUARDIA_ACTIVE_STATUSES.includes(p.guardia.lifecycleStatus);
    const isPostulante = POSTULANTE_STATUSES.includes(p.guardia.lifecycleStatus);
    const kind: "guardia" | "postulante" = isActive ? "guardia" : "postulante";

    if (type === "guardia" && !isActive) continue;
    if (type === "postulante" && !isPostulante) continue;
    if (type === "all" && !isActive && !isPostulante) continue;

    const last = lastByPersona.get(p.id);
    const installationName = p.guardia.currentInstallation?.name;
    const subtitle = isActive
      ? `Guardia activo${installationName ? ` — ${installationName}` : ""}`
      : `Postulante — ${p.guardia.lifecycleStatus}`;

    results.push({
      id: p.id,
      guardiaId: p.guardia.id,
      kind,
      displayName: `${p.firstName} ${p.lastName}`.trim(),
      rut: p.rut,
      email: p.email,
      phone: p.phoneMobile ?? p.phone,
      subtitle,
      lastAssessmentAt: last?.toISOString() ?? null,
    });
  }

  return NextResponse.json({ success: true, results });
}
