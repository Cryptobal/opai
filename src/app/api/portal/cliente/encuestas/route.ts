import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  // Get installation IDs for this account
  const installations = await prisma.crmInstallation.findMany({
    where: {
      accountId: session.accountId,
      tenantId: session.tenantId,
    },
    select: { id: true },
  });

  const installationIds = installations.map((i) => i.id);

  if (installationIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Query encuestas for this account (by accountId OR by installationId in account's installations)
  const encuestas = await prisma.opsEncuestaCliente.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [
        { accountId: session.accountId },
        { installationId: { in: installationIds } },
      ],
    },
    select: {
      id: true,
      installationId: true,
      contactName: true,
      serviceQuality: true,
      scheduleCompliance: true,
      personalPresentation: true,
      professionalism: true,
      supervisionPresence: true,
      incidentResponse: true,
      npsScore: true,
      additionalComments: true,
      averageScore: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ success: true, data: encuestas });
}
