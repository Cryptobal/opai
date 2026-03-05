import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  const result = await validateSupervisorSession(session);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  const { adminId, tenantId, installations } = result.data;
  const { searchParams } = new URL(req.url);
  const filterInstallationId = searchParams.get("installationId");

  const installationIds = filterInstallationId
    ? installations.filter((i) => i.id === filterInstallationId).map((i) => i.id)
    : installations.map((i) => i.id);

  if (installationIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Regular assignments
  const regularAssignments = await prisma.opsAsignacionGuardia.findMany({
    where: {
      tenantId,
      installationId: { in: installationIds },
      isActive: true,
    },
    include: {
      guardia: {
        include: {
          persona: {
            select: { firstName: true, lastName: true, rut: true, phoneMobile: true, phone: true },
          },
        },
      },
      puesto: { select: { name: true } },
    },
  });

  // Extra shifts for today
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const extraShifts = await prisma.opsTurnoExtra.findMany({
    where: {
      tenantId,
      installationId: { in: installationIds },
      date: { gte: todayStart, lt: todayEnd },
      status: { not: "rejected" },
    },
    include: {
      guardia: {
        include: {
          persona: {
            select: { firstName: true, lastName: true, rut: true, phoneMobile: true, phone: true },
          },
        },
      },
    },
  });

  // Group by installation
  const grouped = installationIds.map((instId) => {
    const instInfo = installations.find((i) => i.id === instId);
    const regulares = regularAssignments
      .filter((a) => a.installationId === instId)
      .map((a) => ({
        id: a.guardia.id,
        firstName: a.guardia.persona.firstName,
        lastName: a.guardia.persona.lastName,
        rut: a.guardia.persona.rut ?? null,
        phone: a.guardia.persona.phoneMobile ?? a.guardia.persona.phone ?? null,
        puestoName: a.puesto.name,
        isExtraShift: false,
        status: a.guardia.status,
      }));

    const extras = extraShifts
      .filter((e) => e.installationId === instId)
      .map((e) => ({
        id: e.guardia.id,
        firstName: e.guardia.persona.firstName,
        lastName: e.guardia.persona.lastName,
        rut: e.guardia.persona.rut ?? null,
        phone: e.guardia.persona.phoneMobile ?? e.guardia.persona.phone ?? null,
        puestoName: "Turno Extra",
        isExtraShift: true,
        status: e.guardia.status,
      }));

    return {
      installationId: instId,
      installationName: instInfo?.name ?? "",
      guards: [...regulares, ...extras],
    };
  });

  return NextResponse.json({ success: true, data: grouped });
}
