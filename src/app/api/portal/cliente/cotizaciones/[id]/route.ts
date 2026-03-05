import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const { id } = await params;

  const quote = await prisma.cpqQuote.findFirst({
    where: { id, accountId: session.accountId, tenantId: session.tenantId },
    include: {
      positions: {
        select: {
          id: true,
          customName: true,
          numGuards: true,
          numPuestos: true,
          startTime: true,
          endTime: true,
          weekdays: true,
          monthlyPositionCost: true,
        },
      },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      ...quote,
      monthlyCost: quote.monthlyCost?.toNumber() ?? 0,
      positions: quote.positions.map((p) => ({
        ...p,
        monthlyPositionCost: p.monthlyPositionCost?.toNumber() ?? 0,
      })),
    },
  });
}
