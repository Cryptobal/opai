import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchPersonalSlackDm } from "@/lib/integrations/slack/personal-dm";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TARGET_DAYS = new Set([7, 3, 1]);

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Paso 1: reprocesar links PENDING de licitaciones (dueño sin Calendar al
  // momento del sync). Cap 20 por corrida; actor = owner de la cuenta del deal.
  let retriedPending = 0;
  try {
    const pending = await prisma.agendaEventLink.findMany({
      where: { sourceType: "licitacion", syncStatus: "PENDING" },
      select: { id: true, tenantId: true, sourceId: true },
      take: 20,
      orderBy: { updatedAt: "asc" },
    });
    const { syncLicitacionToCalendar } = await import(
      "@/modules/agenda/agenda-sync-licitacion"
    );
    for (const link of pending) {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: link.sourceId, tenantId: link.tenantId },
        select: { account: { select: { ownerId: true } } },
      });
      const actorUserId = deal?.account.ownerId ?? null;
      if (!actorUserId) continue; // sin dueño → syncLicitacion deja ERROR legible
      await syncLicitacionToCalendar(link.tenantId, link.sourceId, "upsert", {
        actorUserId,
      });
      retriedPending += 1;
    }
  } catch (err) {
    console.warn("[calendar] retry pending licitaciones:", err);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const max = new Date(today);
  max.setUTCDate(max.getUTCDate() + 8);

  const deals = await prisma.crmDeal.findMany({
    where: {
      isLicitacion: true,
      status: "open",
      fechaEntrega: { gte: today, lt: max },
    },
    include: { account: { select: { name: true, ownerId: true } } },
  });

  let sent = 0;
  for (const deal of deals) {
    if (!deal.fechaEntrega || !deal.account.ownerId) continue;
    const days = Math.round(
      (deal.fechaEntrega.getTime() - today.getTime()) / 86_400_000,
    );
    if (!TARGET_DAYS.has(days)) continue;

    await dispatchPersonalSlackDm({
      tenantId: deal.tenantId,
      adminId: deal.account.ownerId,
      typeKey: "licitacion_reminder",
      title: `Licitación T-${days}: ${deal.title}`,
      body: `${deal.account.name} · entrega en ${days} día(s)`,
      category: "comercial",
      link: `${getCanonicalSiteUrl()}/crm/deals/${deal.id}`,
    });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, retriedPending });
}
