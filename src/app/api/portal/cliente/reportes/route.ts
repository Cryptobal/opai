import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ClienteSession } from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("portal_cliente_session")?.value;
  if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });

  let session: ClienteSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get("installationId");

  const where: Record<string, unknown> = {
    accountId: session.accountId,
    tenantId: session.tenantId,
  };
  if (installationId) {
    where.installationId = installationId;
  }

  const reportes = await prisma.portalClienteReporte.findMany({
    where,
    orderBy: { period: "desc" },
    select: {
      id: true,
      installationId: true,
      period: true,
      pdfUrl: true,
      generatedAt: true,
      sentAt: true,
      data: true,
      createdAt: true,
    },
    take: 24,
  });

  return NextResponse.json({ success: true, data: reportes });
}
