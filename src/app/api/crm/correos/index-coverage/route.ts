/** POST /api/crm/correos/index-coverage — indexar casillas del alcance activo. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import {
  clearEmailIndexCoverageCache,
  getEmailIndexCoverage,
} from "@/modules/crm/email/email-index-coverage";
import {
  emailEmbeddingsDisabled,
  indexRecentEmailMessages,
} from "@/modules/crm/email/email-embeddings";
import { resolveMailboxScope } from "@/modules/crm/email/mailbox-scope";

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

  let bodyAccountId: string | null = null;
  let bodyLimit = 50;
  try {
    const body = (await req.json().catch(() => null)) as {
      limit?: number;
      accountId?: string;
    } | null;
    if (body?.limit != null) {
      bodyLimit = Math.min(Math.max(Number(body.limit) || 50, 1), 50);
    }
    if (typeof body?.accountId === "string") bodyAccountId = body.accountId;
  } catch {
    /* sin body */
  }

  const accountIdParam =
    bodyAccountId ?? req.nextUrl.searchParams.get("accountId");
  const resolved = await resolveMailboxScope({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    requestedAccountId: accountIdParam,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (resolved.scope.accountIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No hay casilla Gmail conectada." },
      { status: 404 },
    );
  }

  rateByUser.set(rateKey, Date.now());
  const deadline = Date.now() + 45_000;
  let chunks = 0;
  let tokens = 0;
  for (const emailAccountId of resolved.scope.accountIds) {
    if (Date.now() >= deadline) break;
    const result = await indexRecentEmailMessages({
      tenantId: session.user.tenantId,
      emailAccountId,
      deadline,
      limit: bodyLimit,
    });
    chunks += result.chunks;
    tokens += result.tokens;
  }

  clearEmailIndexCoverageCache(session.user.tenantId, resolved.scope.accountIds);
  const coverage = await getEmailIndexCoverage({
    tenantId: session.user.tenantId,
    emailAccountIds: resolved.scope.accountIds,
  });

  return NextResponse.json({
    ok: true,
    chunks,
    tokens,
    coverage,
  });
}
