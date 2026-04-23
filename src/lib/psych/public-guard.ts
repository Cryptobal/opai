/**
 * Guard común para /api/public/psych/[token]/*.
 * Verifica firma, expiración y que el assessment exista y no haya expirado
 * de manera lógica (status EXPIRED). Retorna el assessment mínimamente cargado
 * para que los endpoints públicos no expongan más de lo necesario.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPsychInvitation } from "./invitation-token";

export interface PublicAssessmentLoaded {
  id: string;
  tenantId: string;
  status: string;
  expiresAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  versionId: string;
  targetName: string;
  consentAcceptedAt: Date | null;
}

export async function loadPublicAssessment(
  token: string,
): Promise<
  | { ok: true; assessment: PublicAssessmentLoaded }
  | { ok: false; response: NextResponse }
> {
  let verified;
  try {
    verified = await verifyPsychInvitation(token);
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Enlace inválido o expirado" },
        { status: 401 },
      ),
    };
  }

  const a = await prisma.psychAssessment.findUnique({
    where: { id: verified.aid },
    select: {
      id: true,
      tenantId: true,
      status: true,
      expiresAt: true,
      startedAt: true,
      submittedAt: true,
      versionId: true,
      targetName: true,
      consentAcceptedAt: true,
      invitationToken: true,
    },
  });
  if (!a || a.tenantId !== verified.tid) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Evaluación no encontrada" },
        { status: 404 },
      ),
    };
  }
  if (a.invitationToken !== token) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Enlace reemplazado por uno más reciente" },
        { status: 401 },
      ),
    };
  }
  if (a.status === "EXPIRED" || a.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Enlace expirado" },
        { status: 410 },
      ),
    };
  }

  const { invitationToken: _ignored, ...rest } = a;
  void _ignored;
  return { ok: true, assessment: rest };
}
