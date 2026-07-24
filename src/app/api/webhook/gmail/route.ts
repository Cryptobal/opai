import { after, NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { parseGmailPushBody } from "@/modules/crm/email/gmail-push-payload";
import { writeSyncState } from "@/modules/crm/email/gmail-sync-state";
import {
  enqueueGmailSyncJob,
  processGmailSyncJob,
} from "@/modules/crm/email/gmail-sync-queue";
import { captureEmailError } from "@/modules/crm/email/email-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Verificación OIDC del push de Pub/Sub (V3): valida el JWT del header
 * Authorization contra los certs de Google, con audience = URL pública del
 * webhook (GMAIL_PUSH_AUDIENCE) y service account emisora (GMAIL_PUSH_SA_EMAIL).
 * Requiere que la suscripción envíe el token (ver docs/gmail-push.md).
 */
async function verifyPushOidc(
  req: NextRequest,
): Promise<{ ok: boolean; reason?: string }> {
  const audience = process.env.GMAIL_PUSH_AUDIENCE;
  const saEmail = process.env.GMAIL_PUSH_SA_EMAIL;
  if (!audience || !saEmail) {
    return { ok: false, reason: "env_missing" };
  }
  const authz = req.headers.get("authorization") ?? "";
  const jwt = authz.startsWith("Bearer ") ? authz.slice("Bearer ".length) : null;
  if (!jwt) return { ok: false, reason: "jwt_missing" };
  try {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: jwt, audience });
    const payload = ticket.getPayload();
    if (!payload || !GOOGLE_ISSUERS.includes(payload.iss)) {
      return { ok: false, reason: "bad_issuer" };
    }
    if (payload.email !== saEmail || payload.email_verified !== true) {
      return { ok: false, reason: "bad_email" };
    }
    return { ok: true };
  } catch {
    // verifyIdToken lanza en firma inválida, audience errónea o exp vencido.
    return { ok: false, reason: "jwt_invalid" };
  }
}

/**
 * POST /api/webhook/gmail — notificaciones push de Gmail vía Cloud Pub/Sub.
 * Responde 204 solo después del enqueue durable (o para pushes descartables) y
 * 503 ante fallas previas para que Pub/Sub reintente. `after()` intenta el
 * delta inmediato sin hacer esperar a Pub/Sub; el cron recupera sus fallos.
 */
export async function POST(req: NextRequest) {
  const pushToken = process.env.GMAIL_PUSH_TOKEN;
  if (pushToken && req.nextUrl.searchParams.get("token") !== pushToken) {
    return new NextResponse(null, { status: 403 });
  }

  // Flag V3: en true el push exige OIDC válido (403 si falta o es inválido);
  // en false (modo transición) el token de query sigue mandando y solo se
  // loggea el estado del JWT para verificar la infra antes de exigirlo.
  const oidc = await verifyPushOidc(req);
  if (process.env.GMAIL_PUSH_OIDC_REQUIRED === "true") {
    if (!oidc.ok) {
      console.warn("[gmail] push rechazado: OIDC inválido", { reason: oidc.reason });
      return new NextResponse(null, { status: 403 });
    }
  } else if (!oidc.ok) {
    console.warn("[gmail] push sin OIDC válido (modo transición, se acepta)", {
      reason: oidc.reason,
    });
  }

  if (process.env.GMAIL_PUSH_ENABLED !== "true") {
    return new NextResponse(null, { status: 204 });
  }

  const payload = parseGmailPushBody(await req.json().catch(() => null));
  if (!payload?.emailAddress) return new NextResponse(null, { status: 204 });

  let accounts: Array<{ id: string; tenantId: string }>;
  try {
    accounts = await prisma.crmEmailAccount.findMany({
      where: {
        provider: "gmail",
        email: payload.emailAddress,
        status: "active",
      },
      select: {
        id: true,
        tenantId: true,
      },
    });
    if (accounts.length === 0) return new NextResponse(null, { status: 204 });

    await Promise.all(
      accounts.map(async (account) => {
        await writeSyncState(account.id, {
          push: {
            lastPushAt: new Date().toISOString(),
            lastPushHistoryId: payload.historyId,
          },
        });
        await enqueueGmailSyncJob({
          tenantId: account.tenantId,
          emailAccountId: account.id,
          reason: "push",
          historyId: payload.historyId,
        });
      }),
    );
  } catch (err) {
    captureEmailError(err, { scope: "push-enqueue", level: "warning" });
    return new NextResponse(null, { status: 503 });
  }

  console.info("[gmail] push", {
    emailAccountIds: accounts.map((account) => account.id),
    email: payload.emailAddress,
    historyId: payload.historyId,
  });

  try {
    after(async () => {
      await Promise.allSettled(
        accounts.map(async (account) => {
          try {
            await processGmailSyncJob({
              emailAccountId: account.id,
              profile: "delta",
              maxResults: 100,
              deadlineMs: Date.now() + 25_000,
            });
          } catch (err) {
            captureEmailError(err, {
              scope: "push-delta",
              tenantId: account.tenantId,
              emailAccountId: account.id,
              level: "warning",
              extra: { note: "queda en retry" },
            });
          }
        }),
      );
    });
  } catch (err) {
    captureEmailError(err, { scope: "push-after", level: "warning" });
  }

  return new NextResponse(null, { status: 204 });
}
