/** POST /api/crm/correos/index-coverage — indexar la casilla del solicitante. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import {
  clearEmailIndexCoverageCache,
  getEmailIndexCoverage,
} from "@/modules/crm/email/email-index-coverage";
import {
  emailEmbeddingsDisabled,
  indexRecentEmailMessages,
} from "@/modules/crm/email/email-embeddings";

const rateByUser = new Map<string, number>();
const RATE_MS = 60_000;

export async function POST(req: NextRequest) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (emailEmbeddingsDisabled()) {
    return NextResponse.json(
      { ok: false, error: "La indexación semántica está deshabilitada (EMAIL_EMBEDDINGS_DISABLED)." },
      { status: 503 },
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Falta OPENAI_API_KEY para generar embeddings." },
      { status: 503 },
    );
  }

  const rateKey = `${session.user.tenantId}:${session.user.id}`;
  const last = rateByUser.get(rateKey) ?? 0;
  if (Date.now() - last < RATE_MS) {
    return NextResponse.json(
      { ok: false, error: "Esperá un minuto antes de volver a indexar." },
      { status: 429 },
    );
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "No hay casilla Gmail conectada." },
      { status: 404 },
    );
  }

  let bodyLimit = 300;
  try {
    const body = (await req.json().catch(() => null)) as { limit?: number } | null;
    if (body?.limit != null) {
      bodyLimit = Math.min(Math.max(Number(body.limit) || 300, 1), 300);
    }
  } catch {
    /* sin body */
  }

  rateByUser.set(rateKey, Date.now());
  const deadline = Date.now() + 20_000;
  const result = await indexRecentEmailMessages({
    tenantId: session.user.tenantId,
    emailAccountId: account.id,
    deadline,
    limit: bodyLimit,
  });

  clearEmailIndexCoverageCache(session.user.tenantId, account.id);
  const coverage = await getEmailIndexCoverage({
    tenantId: session.user.tenantId,
    emailAccountId: account.id,
  });

  return NextResponse.json({
    ok: true,
    chunks: result.chunks,
    tokens: result.tokens,
    coverage,
  });
}
