import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ClienteSession } from "@/lib/portal-cliente";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("portal_cliente_session")?.value;
  if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });

  let session: ClienteSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const quotes = await prisma.cpqQuote.findMany({
    where: { accountId: session.accountId, tenantId: session.tenantId },
    include: {
      positions: { select: { id: true, numGuards: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = quotes.map((q) => ({
    id: q.id,
    code: q.code,
    name: q.name,
    status: q.status,
    monthlyCost: q.monthlyCost?.toNumber() ?? 0,
    validUntil: q.validUntil,
    totalPositions: q.positions.length,
    totalGuards: q.positions.reduce((s, p) => s + (p.numGuards ?? 0), 0),
    currency: q.currency,
    createdAt: q.createdAt,
  }));

  return NextResponse.json({ success: true, data });
}
