/**
 * POST /api/public/psych/[token]/consent — registra consentAcceptedAt y
 * metadatos del cliente (IP, UA, fingerprint opcional) para trazabilidad
 * Ley 21.719.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { loadPublicAssessment } from "@/lib/psych/public-guard";

interface Ctx {
  params: Promise<{ token: string }>;
}

const BodySchema = z.object({
  fingerprint: z.string().max(256).optional(),
  tzOffsetMinutes: z.number().int().min(-900).max(900).optional(),
  locale: z.string().max(16).optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const g = await loadPublicAssessment(token);
  if (!g.ok) return g.response;

  const parsed = await parseBody(req, BodySchema);
  if (parsed.error) return parsed.error;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent") ?? null;

  const metadata = {
    ip,
    userAgent: ua,
    fingerprint: parsed.data.fingerprint ?? null,
    tzOffsetMinutes: parsed.data.tzOffsetMinutes ?? null,
    locale: parsed.data.locale ?? null,
    consentAt: new Date().toISOString(),
  };

  await prisma.psychAssessment.update({
    where: { id: g.assessment.id },
    data: {
      consentAcceptedAt: g.assessment.consentAcceptedAt ?? new Date(),
      clientMetadata: metadata as never,
    },
  });
  return NextResponse.json({ success: true });
}
