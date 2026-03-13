import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data)
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { tenantId, installations } = result.data;
  const { searchParams } = new URL(req.url);
  const filterInstallationId = searchParams.get("installationId");
  const filterStatus = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const installationIds = filterInstallationId
    ? installations.filter((i) => i.id === filterInstallationId).map((i) => i.id)
    : installations.map((i) => i.id);

  if (installationIds.length === 0)
    return NextResponse.json({ success: true, data: [] });

  const where: Record<string, unknown> = {
    tenantId,
    installationId: { in: installationIds },
  };
  if (filterStatus) where.status = filterStatus;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.date = dateFilter;
  }

  const items = await prisma.opsTurnoExtra.findMany({
    where,
    orderBy: { date: "desc" },
    take: 100,
    include: {
      guardia: {
        include: {
          persona: { select: { firstName: true, lastName: true } },
        },
      },
      installation: { select: { name: true } },
    },
  });

  return NextResponse.json({
    success: true,
    data: items.map((t) => ({
      id: t.id,
      date: t.date,
      status: t.status,
      tipo: t.tipo,
      horasExtra: t.horasExtra,
      amountClp: t.amountClp,
      isManual: t.isManual,
      installationId: t.installationId,
      installationName: t.installation.name,
      guardiaId: t.guardiaId,
      guardiaName: `${t.guardia.persona.firstName} ${t.guardia.persona.lastName}`,
      createdAt: t.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data)
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });

  const { adminId, tenantId, installations } = result.data;

  let body: {
    installationId: string;
    guardiaId: string;
    puestoId?: string;
    date: string;
    tipo?: "turno_extra" | "hora_extra";
    horasExtra?: number;
    amountClp?: number;
    amountJustification?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 });
  }

  const {
    installationId,
    guardiaId,
    puestoId,
    date,
    tipo = "turno_extra",
    horasExtra,
    amountClp: customAmountClp,
    amountJustification,
  } = body;

  if (!installationId || !guardiaId || !date)
    return NextResponse.json(
      { success: false, error: "installationId, guardiaId y date son requeridos" },
      { status: 400 }
    );

  const isAssigned = installations.some((i) => i.id === installationId);
  if (!isAssigned)
    return NextResponse.json(
      { success: false, error: "No tienes acceso a esta instalación" },
      { status: 403 }
    );

  const inst = await prisma.crmInstallation.findUnique({
    where: { id: installationId },
    select: { teMontoClp: true },
  });

  const defaultAmount = Number(inst?.teMontoClp ?? 0);
  const finalAmountClp = customAmountClp != null ? customAmountClp : defaultAmount;

  const te = await prisma.opsTurnoExtra.create({
    data: {
      tenantId,
      installationId,
      guardiaId,
      puestoId: puestoId ?? undefined,
      date: new Date(date),
      tipo,
      horasExtra: horasExtra ? horasExtra : undefined,
      amountClp: finalAmountClp,
      amountJustification: amountJustification?.trim() || null,
      isManual: true,
      status: "pending",
      createdBy: adminId,
    },
  });

  return NextResponse.json({ success: true, data: { id: te.id } });
}
