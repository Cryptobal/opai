import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const oldIds = await prisma.notification.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take: 5000,
  });
  if (oldIds.length === 0) return NextResponse.json({ deleted: 0 });
  const ids = oldIds.map((n) => n.id);
  await prisma.notificationReadState.deleteMany({ where: { notificationId: { in: ids } } });
  const r = await prisma.notification.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ deleted: r.count });
}
