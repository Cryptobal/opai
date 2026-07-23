/**
 * Cron por minuto (PR-12): red de seguridad del outbox de correo. Despacha lo
 * vencido de la ventana de deshacer que el after() no alcanzó (instancia
 * muerta), los envíos programados y los reintentos con backoff.
 */
import { NextRequest, NextResponse } from "next/server";
import { dispatchDueOutbox } from "@/modules/crm/email/email-outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await dispatchDueOutbox({
    limit: 20,
    deadlineMs: Date.now() + 50_000,
  });
  return NextResponse.json({ ok: true, ...result });
}
