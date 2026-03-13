import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { DEMO_PERSONAL } from "@/lib/portal/demo-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  // Prospect mode: return hardcoded demo data
  if (session.isProspect) {
    return NextResponse.json({ success: true, guards: DEMO_PERSONAL });
  }

  // Active mode: query real data
  const installations = await prisma.crmInstallation.findMany({
    where: { accountId: session.accountId, tenantId: session.tenantId, status: "active" },
    select: { id: true, name: true },
  });

  const installationIds = installations.map((i) => i.id);

  if (installationIds.length === 0) {
    return NextResponse.json({ success: true, guards: [] });
  }

  const guards = await prisma.opsGuardia.findMany({
    where: {
      tenantId: session.tenantId,
      currentInstallationId: { in: installationIds },
      status: "active",
    },
    include: {
      persona: { select: { firstName: true, lastName: true } },
      documents: {
        select: { type: true, status: true, fileUrl: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const mapped = guards.map((g) => {
    const first = g.persona.firstName?.trim() || "";
    const last = g.persona.lastName?.trim() || "";
    const nombre = `${first} ${last}`.trim();
    const avatar =
      (first[0] || "").toUpperCase() + (last[0] || "").toUpperCase();

    // Sort documents: highlighted (OS-10, antecedentes) first
    const highlightTypes = ["Certificado OS-10", "Cert. antecedentes"];
    const docs = g.documents.map((d) => ({
      tipo: d.type,
      status: d.status,
      fileUrl: d.fileUrl ?? undefined,
      destacado: highlightTypes.some((h) =>
        d.type.toLowerCase().includes(h.toLowerCase())
      ),
    }));

    docs.sort((a, b) => {
      if (a.destacado && !b.destacado) return -1;
      if (!a.destacado && b.destacado) return 1;
      return 0;
    });

    return {
      nombre,
      avatar,
      turno: "", // shift info not directly on OpsGuardia
      status: "Asignado",
      online: false,
      documentos: docs,
    };
  });

  return NextResponse.json({ success: true, guards: mapped });
}
