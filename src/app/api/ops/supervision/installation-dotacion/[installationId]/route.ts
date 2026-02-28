import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { installationId: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { installationId } = await params;
    const sp = request.nextUrl.searchParams;
    const dateStr = sp.get("date") ?? new Date().toISOString().slice(0, 10);
    // Optional time filter: only return guards whose shift covers this time (HH:MM)
    const timeStr = sp.get("time") ?? null;

    // 1. Get regular guard assignments (active dotación)
    const asignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        isActive: true,
      },
      include: {
        guardia: {
          include: {
            persona: {
              select: { firstName: true, lastName: true, rut: true },
            },
          },
        },
        puesto: {
          select: { id: true, name: true, shiftStart: true, shiftEnd: true },
        },
      },
      orderBy: [{ puesto: { name: "asc" } }, { slotNumber: "asc" }],
    });

    // 2. Get reinforcement shifts for today
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    const refuerzos = await prisma.opsRefuerzoSolicitud.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        startAt: { lte: endOfDay },
        endAt: { gte: startOfDay },
        status: { in: ["solicitado", "en_curso", "realizado"] },
      },
      include: {
        guardia: {
          include: {
            persona: {
              select: { firstName: true, lastName: true, rut: true },
            },
          },
        },
        puesto: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startAt: "asc" },
    });

    // Helper: check if time (in minutes from midnight) falls within a shift
    function isTimeInShift(nowMinutes: number, startStr: string | null, endStr: string | null): boolean {
      if (!startStr || !endStr) return true; // No shift times defined → include
      const sParts = startStr.split(":");
      const eParts = endStr.split(":");
      const startMin = parseInt(sParts[0], 10) * 60 + parseInt(sParts[1], 10);
      const endMin = parseInt(eParts[0], 10) * 60 + parseInt(eParts[1], 10);
      if (startMin <= endMin) {
        // Day shift (e.g. 08:00–20:00)
        return nowMinutes >= startMin && nowMinutes < endMin;
      }
      // Night shift crossing midnight (e.g. 20:00–08:00)
      return nowMinutes >= startMin || nowMinutes < endMin;
    }

    // Parse time filter (HH:MM → minutes)
    let currentMinutes: number | null = null;
    if (timeStr) {
      const parts = timeStr.split(":");
      currentMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    // Format regular guards
    const allRegularGuards = asignaciones.map((a) => ({
      id: a.id,
      type: "regular" as const,
      guardId: a.guardia.id,
      guardName: `${a.guardia.persona.firstName} ${a.guardia.persona.lastName}`,
      guardRut: a.guardia.persona.rut,
      puestoName: a.puesto.name,
      slotNumber: a.slotNumber,
      shiftStart: a.puesto.shiftStart,
      shiftEnd: a.puesto.shiftEnd,
    }));

    // Filter by shift time if provided
    const regularGuards = currentMinutes !== null
      ? allRegularGuards.filter((g) => isTimeInShift(currentMinutes!, g.shiftStart, g.shiftEnd))
      : allRegularGuards;

    // Format reinforcement guards
    const allReinforcementGuards = refuerzos.map((r) => ({
      id: r.id,
      type: "reinforcement" as const,
      guardId: r.guardia.id,
      guardName: `${r.guardia.persona.firstName} ${r.guardia.persona.lastName}`,
      guardRut: r.guardia.persona.rut,
      puestoName: r.puesto?.name ?? "Refuerzo",
      slotNumber: null,
      shiftStart: r.startAt.toISOString(),
      shiftEnd: r.endAt.toISOString(),
    }));

    // Filter reinforcement by time (they use full ISO timestamps)
    const reinforcementGuards = currentMinutes !== null
      ? allReinforcementGuards.filter((r) => {
          const now = new Date();
          return now >= new Date(r.shiftStart) && now <= new Date(r.shiftEnd);
        })
      : allReinforcementGuards;

    return NextResponse.json({
      success: true,
      data: {
        regular: regularGuards,
        reinforcement: reinforcementGuards,
        totalExpected: regularGuards.length + reinforcementGuards.length,
      },
    });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching dotacion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la dotación" },
      { status: 500 },
    );
  }
}
