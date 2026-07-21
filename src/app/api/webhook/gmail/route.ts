import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGmailAccount } from "@/modules/crm/email/gmail-sync.service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/webhook/gmail — notificaciones push de Gmail vía Cloud Pub/Sub.
 * Valida el token de verificación (query `?token=`), decodifica el mensaje
 * ({ emailAddress, historyId }), ubica la casilla por email y dispara un sync
 * incremental (deadline 25s; el sweep queda al cron). Responde 204 SIEMPRE
 * (Pub/Sub reintenta ante 5xx). No-op si `GMAIL_PUSH_TOKEN` no está configurado.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.GMAIL_PUSH_TOKEN;
  if (!expected) return new NextResponse(null, { status: 204 });
  if (req.nextUrl.searchParams.get("token") !== expected) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = (await req.json().catch(() => null)) as { message?: { data?: string } } | null;
    const dataB64 = body?.message?.data;
    if (dataB64) {
      const decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8")) as {
        emailAddress?: string;
        historyId?: string;
      };
      if (decoded.emailAddress) {
        const accounts = await prisma.crmEmailAccount.findMany({
          where: { email: decoded.emailAddress, provider: "gmail", status: "active" },
          select: { id: true, tenantId: true },
          take: 5,
        });
        const deadlineMs = Date.now() + 25_000;
        for (const acc of accounts) {
          if (Date.now() >= deadlineMs) break;
          await syncGmailAccount({
            tenantId: acc.tenantId,
            emailAccountId: acc.id,
            maxResults: 100,
            deadlineMs,
          }).catch((e) => console.warn("[webhook/gmail] sync falló", acc.id, e));
        }
      }
    }
  } catch (err) {
    console.warn("[webhook/gmail] error", err);
  }

  return new NextResponse(null, { status: 204 });
}
