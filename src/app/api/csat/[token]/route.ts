import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

type Params = { token: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

interface PublicTicketSummary {
  code: string;
  title: string;
  status: string;
  resolvedAt: string | null;
  closedAt: string | null;
  alreadySubmitted: boolean;
  existingRating: number | null;
}

async function findTicket(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return prisma.opsTicket.findFirst({
    where: { csatToken: token },
    select: {
      id: true,
      tenantId: true,
      code: true,
      title: true,
      status: true,
      resolvedAt: true,
      closedAt: true,
      csatTokenExp: true,
      csat: { select: { rating: true } },
    },
  });
}

function buildSummary(t: NonNullable<Awaited<ReturnType<typeof findTicket>>>): PublicTicketSummary {
  return {
    code: t.code,
    title: t.title,
    status: t.status,
    resolvedAt:
      t.resolvedAt instanceof Date ? t.resolvedAt.toISOString() : t.resolvedAt,
    closedAt:
      t.closedAt instanceof Date ? t.closedAt.toISOString() : t.closedAt,
    alreadySubmitted: t.csat != null,
    existingRating: t.csat?.rating ?? null,
  };
}

function tokenExpired(t: { csatTokenExp: Date | null }): boolean {
  if (!t.csatTokenExp) return false;
  return new Date(t.csatTokenExp).getTime() < Date.now();
}

function fingerprintFrom(req: NextRequest): string | null {
  // Hash del IP + UA. NO almacenamos PII, solo el hash sha-256 truncado.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "";
  const ua = req.headers.get("user-agent") ?? "";
  const raw = `${ip}|${ua}`;
  if (!raw.trim()) return null;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * GET /api/csat/[token]
 * Endpoint público (sin auth). Devuelve el resumen mínimo del ticket
 * para mostrar en el form, o 410 si el token expiró.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { token } = await params;
    const t = await findTicket(token);
    if (!t) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 404 },
      );
    }
    if (tokenExpired(t)) {
      return NextResponse.json(
        { success: false, error: "El enlace expiró" },
        { status: 410 },
      );
    }
    return NextResponse.json({ success: true, data: buildSummary(t) });
  } catch (err) {
    console.error("[csat] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/csat/[token]
 * Body: { rating: 1..5, comment?: string }
 * Endpoint público (sin auth). Permite re-submit (upsert) mientras el
 * token siga vigente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { token } = await params;
    const t = await findTicket(token);
    if (!t) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 404 },
      );
    }
    if (tokenExpired(t)) {
      return NextResponse.json(
        { success: false, error: "El enlace expiró" },
        { status: 410 },
      );
    }

    const body = await request.json();
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: "rating debe ser entero entre 1 y 5" },
        { status: 400 },
      );
    }
    const comment =
      typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : null;

    const fingerprint = fingerprintFrom(request);

    await prisma.opsTicketCsat.upsert({
      where: { ticketId: t.id },
      create: {
        ticketId: t.id,
        tenantId: t.tenantId,
        rating,
        comment: comment || null,
        fingerprint,
      },
      update: {
        rating,
        comment: comment || null,
        // Si ya hay fingerprint guardado, lo conservamos para evitar
        // que un re-submit desde otro device se sobrescriba.
        fingerprint: fingerprint ?? undefined,
      },
    });

    // Audit best-effort.
    try {
      const { recordTicketEvent } = await import("@/lib/tickets-events");
      await recordTicketEvent({
        tenantId: t.tenantId,
        ticketId: t.id,
        type: "csat_submitted",
        actorId: null,
        data: { rating },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[csat] POST error:", err);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}
