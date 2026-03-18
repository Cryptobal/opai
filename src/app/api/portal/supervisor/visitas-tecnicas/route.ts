import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data) return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { adminId, tenantId, installations } = result.data;
  const installationIds = installations.map((i) => i.id);

  const { searchParams } = new URL(req.url);
  const installationId = searchParams.get("installationId");
  const status = searchParams.get("status");

  // Listar visitas asignadas al supervisor (userId). No filtrar por installationIds:
  // las visitas programadas desde CPQ pueden ser en instalaciones prospecto no asignadas.
  const items = await prisma.opsVisitaTecnica.findMany({
    where: {
      tenantId,
      userId: adminId,
      ...(installationId ? { installationId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      installation: { select: { id: true, name: true } },
      account: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ success: true, data: items });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data) return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { adminId, tenantId, installations } = result.data;
  const installationIds = installations.map((i) => i.id);

  const body = await req.json();
  const { installationId, accountId, dealId } = body;

  if (!installationId || !accountId) {
    return NextResponse.json({ success: false, error: "installationId y accountId son requeridos" }, { status: 400 });
  }

  // Allow active assigned installations OR any prospecto (isActive=false) in the tenant
  if (!installationIds.includes(installationId)) {
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId, status: "prospect" },
      select: { id: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no asignada" }, { status: 403 });
    }
  }

  const visita = await prisma.opsVisitaTecnica.create({
    data: {
      tenantId,
      userId: adminId,
      installationId,
      accountId,
      dealId: dealId || undefined,
      status: "borrador",
    },
  });

  return NextResponse.json({ success: true, data: visita });
}
