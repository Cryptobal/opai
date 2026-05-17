/**
 * POST /api/psych/assessments — crea una evaluación con token firmado.
 * GET  /api/psych/assessments — lista con filtros status/personaId/q, paginado.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  PSYCH_TEST_CODE,
  PSYCH_TEST_VERSION,
} from "@/lib/psych/constants";
import { signPsychInvitation } from "@/lib/psych/invitation-token";
import { guardPsych } from "@/lib/psych/api-guard";
import { resolveTenantPsychConfig } from "@/lib/psych/scoring/config";
import { resolveAssessmentTarget } from "@/lib/psych/resolve-target";
import { buildEmailUrl } from "@/lib/emails/site-url";

const CreateSchema = z.object({
  targetName: z.string().min(2).max(200),
  targetRut: z.string().trim().max(20).optional().nullable(),
  targetEmail: z.string().email().optional().nullable(),
  targetPhone: z.string().max(30).optional().nullable(),
  personaId: z.string().uuid().optional().nullable(),
  versionCode: z.string().default(PSYCH_TEST_CODE),
  versionTag: z.string().default(PSYCH_TEST_VERSION),
});

const PAGE_SIZE = 20;

export async function POST(req: NextRequest) {
  const guard = await guardPsych("write");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const parsed = await parseBody(req, CreateSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  // 1) Match exacto por (code, version). 2) Fallback: cualquier versión
  // activa del mismo code. Esto evita 404 cuando la BD del tenant no tiene
  // la versión exacta seedeada o quedó marcada inactiva — escenario observado
  // en producción donde la versión por defecto del frontend puede no coincidir
  // con lo seedeado.
  let version = await prisma.psychTestVersion.findUnique({
    where: {
      code_version: { code: body.versionCode, version: body.versionTag },
    },
  });
  if (!version || !version.isActive) {
    version = await prisma.psychTestVersion.findFirst({
      where: { code: body.versionCode, isActive: true },
      orderBy: { publishedAt: "desc" },
    });
  }
  if (!version) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No hay versión activa del test psicolaboral. Contactar al administrador para correr el seed.",
      },
      { status: 404 },
    );
  }

  const cfg = await resolveTenantPsychConfig(ctx.tenantId);
  const assessmentId = crypto.randomUUID();

  const { token, expiresAt } = await signPsychInvitation(
    { aid: assessmentId, tid: ctx.tenantId },
    cfg.invitationTTLHours,
  );

  const target = await resolveAssessmentTarget(ctx.tenantId, body);

  const assessment = await prisma.psychAssessment.create({
    data: {
      id: assessmentId,
      tenantId: ctx.tenantId,
      versionId: version.id,
      personaId: body.personaId ?? null,
      ...target,
      invitationToken: token,
      expiresAt,
      createdById: ctx.userId,
    },
  });

  await logAudit({
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    tenantId: ctx.tenantId,
    action: "CREATE",
    entity: "psych_assessment",
    entityId: assessment.id,
    details: { personaId: body.personaId, versionCode: body.versionCode },
    request: req,
  });

  return NextResponse.json({
    success: true,
    assessmentId: assessment.id,
    token,
    url: buildEmailUrl(`/t/psicotest/${token}`),
    expiresAt,
  });
}

export async function GET(req: NextRequest) {
  const guard = await guardPsych("read");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? undefined;
  const personaId = sp.get("personaId") ?? undefined;
  const q = sp.get("q")?.trim();
  const page = Math.max(1, Number(sp.get("page") ?? 1));

  const where: Record<string, unknown> = { tenantId: ctx.tenantId };
  if (status) where.status = status;
  if (personaId) where.personaId = personaId;
  if (q) {
    where.OR = [
      { targetName: { contains: q, mode: "insensitive" } },
      { targetRut: { contains: q, mode: "insensitive" } },
      { targetEmail: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.psychAssessment.count({ where }),
    prisma.psychAssessment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { result: { select: { globalScore: true, band: true } } },
    }),
  ]);

  return NextResponse.json({ success: true, total, page, pageSize: PAGE_SIZE, rows });
}
