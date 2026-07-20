import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { enqueueOutboxRow, trySendOutboxRow } from "@/lib/integrations/slack/outbox";
import { decryptSlackToken } from "@/lib/integrations/slack/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Digest semanal (lunes): visitas + licitaciones → canal default Slack. */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 7);

  const tenants = await prisma.googleCalendarAccount.findMany({
    where: { status: "ACTIVE" },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });

  let published = 0;
  for (const { tenantId } of tenants) {
    const ws = await getWorkspaceForTenant(tenantId);
    if (!ws?.defaultChannelId) continue;

    const [visitas, deals] = await Promise.all([
      prisma.agendaVisita.count({
        where: {
          tenantId,
          startAt: { gte: from, lt: to },
          status: { not: "cancelada" },
        },
      }),
      prisma.crmDeal.findMany({
        where: {
          tenantId,
          isLicitacion: true,
          status: "open",
          fechaEntrega: { gte: from, lt: to },
        },
        select: { title: true, fechaEntrega: true },
        take: 20,
      }),
    ]);

    const licLines = deals
      .map((d) => {
        const days = d.fechaEntrega
          ? Math.round((d.fechaEntrega.getTime() - from.getTime()) / 86_400_000)
          : "?";
        return `• ${d.title} (T-${days})`;
      })
      .join("\n");

    const text = [
      `Agenda semanal OPAI`,
      `${visitas} visita(s) programadas`,
      deals.length ? `Licitaciones:\n${licLines}` : "Sin entregas de licitación esta semana",
    ].join("\n");

    const dayKey = from.toISOString().slice(0, 10);
    const outboxId = await enqueueOutboxRow({
      tenantId,
      workspaceId: ws.id,
      channelId: ws.defaultChannelId,
      text,
      blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
      dedupeKey: `agenda-digest|${tenantId}|${dayKey}`,
    });
    if (outboxId) {
      try {
        const token = decryptSlackToken(
          (await prisma.slackWorkspace.findUnique({ where: { id: ws.id } }))!.botTokenEnc,
        );
        await trySendOutboxRow(token, outboxId, ws.defaultChannelId, text, [
          { type: "section", text: { type: "mrkdwn", text } },
        ]);
        published++;
      } catch (err) {
        console.warn("[agenda-digest] send failed", tenantId, err);
      }
    }
  }

  return NextResponse.json({ ok: true, published });
}
