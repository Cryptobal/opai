import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

interface GuardiaInput {
  id?: string;
  guardiaId?: string | null;
  guardiaNombre: string;
  isExtra?: boolean;
  horaLlegada?: string | null;
  status?: string; // pendiente, en_camino, presente, no_viene, reemplazo
  turno?: string; // nocturno, diurno
  reemplazaDe?: string | null;
  notes?: string | null;
  _delete?: boolean;
}

function calculateCoberturaStatus(
  guardiasRequeridos: number,
  guardias: { status: string; turno: string }[],
  turnoFilter: string,
): string {
  const filtered = guardias.filter((g) => g.turno === turnoFilter);
  const presentes = filtered.filter((g) => g.status === "presente" || g.status === "reemplazo").length;
  const noVienen = filtered.filter((g) => g.status === "no_viene").length;
  const pendientes = filtered.filter((g) => g.status === "pendiente" || g.status === "en_camino").length;

  if (presentes >= guardiasRequeridos) return "completa";
  if (presentes > 0 && pendientes > 0) return "parcial";
  if (noVienen > 0 && presentes + pendientes < guardiasRequeridos) return "descubierta";
  if (presentes > 0) return "parcial";
  return "pendiente";
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = (await request.json()) as {
      controlInstalacionId: string;
      guardias?: GuardiaInput[];
      singleGuard?: { id: string; status?: string; horaLlegada?: string | null; notes?: string | null; reemplazaDe?: string | null };
    };

    const { controlInstalacionId, guardias, singleGuard } = body;

    if (!controlInstalacionId) {
      return NextResponse.json({ success: false, error: "Missing controlInstalacionId" }, { status: 400 });
    }

    // Verify current user is the active turno operator
    const activeTurno = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, status: "active" },
      select: { operatorId: true },
    });
    if (activeTurno && activeTurno.operatorId !== ctx.userId) {
      return NextResponse.json(
        { success: false, error: "Solo el operador del turno activo puede realizar esta acción" },
        { status: 403 },
      );
    }

    // Verify tenant ownership
    const inst = await prisma.opsControlNocturnoInstalacion.findUnique({
      where: { id: controlInstalacionId },
      include: { controlNocturno: { select: { tenantId: true } } },
    });

    if (!inst || inst.controlNocturno.tenantId !== ctx.tenantId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // ── Fast path: single guard inline update ──
    if (singleGuard?.id) {
      const patch: Record<string, unknown> = {};
      if (singleGuard.status !== undefined) patch.status = singleGuard.status;
      if (singleGuard.horaLlegada !== undefined) patch.horaLlegada = singleGuard.horaLlegada || null;
      if (singleGuard.notes !== undefined) patch.notes = singleGuard.notes || null;
      if (singleGuard.reemplazaDe !== undefined) patch.reemplazaDe = singleGuard.reemplazaDe || null;
      // Auto-set horaLlegada when status becomes "presente"
      if (singleGuard.status === "presente" && singleGuard.horaLlegada === undefined) {
        const now = new Date();
        patch.horaLlegada = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      }

      await prisma.opsControlNocturnoGuardia.update({
        where: { id: singleGuard.id },
        data: patch,
      });

      // Respond immediately, then recalculate cobertura in background
      const response = NextResponse.json({ success: true });

      // Fire-and-forget cobertura recalculation
      prisma.opsControlNocturnoGuardia.findMany({
        where: { controlInstalacionId },
        select: { status: true, turno: true },
      }).then((allGuardias) => {
        const presentesNoche = allGuardias.filter(
          (g) => g.turno === "nocturno" && (g.status === "presente" || g.status === "reemplazo"),
        ).length;
        const coberturaStatus = calculateCoberturaStatus(inst.guardiasRequeridos, allGuardias, "nocturno");
        return prisma.opsControlNocturnoInstalacion.update({
          where: { id: controlInstalacionId },
          data: { guardiasPresentes: presentesNoche, coberturaStatus },
        });
      }).catch((err) => console.error("[GRID] cobertura recalc:", err));

      return response;
    }

    // ── Bulk path: full guard list from modal ──
    if (guardias) {
      // Delete marked records
      const toDelete = guardias.filter((g) => g._delete && g.id);
      if (toDelete.length > 0) {
        await prisma.opsControlNocturnoGuardia.deleteMany({
          where: { id: { in: toDelete.map((g) => g.id!) }, controlInstalacionId },
        });
      }

      // Upsert remaining
      const toUpsert = guardias.filter((g) => !g._delete);
      for (const g of toUpsert) {
        const data = {
          guardiaNombre: g.guardiaNombre,
          guardiaId: g.guardiaId || null,
          isExtra: g.isExtra ?? false,
          horaLlegada: g.horaLlegada || null,
          status: g.status ?? "pendiente",
          turno: g.turno ?? "nocturno",
          reemplazaDe: g.reemplazaDe || null,
          notes: g.notes || null,
        };

        if (g.id) {
          await prisma.opsControlNocturnoGuardia.update({ where: { id: g.id }, data });
        } else {
          await prisma.opsControlNocturnoGuardia.create({
            data: { controlInstalacionId, ...data },
          });
        }
      }

      // Auto-calculate guardiasPresentes and coberturaStatus
      const allGuardias = toUpsert.map((g) => ({
        status: g.status ?? "pendiente",
        turno: g.turno ?? "nocturno",
      }));

      const presentesNoche = allGuardias.filter(
        (g) => g.turno === "nocturno" && (g.status === "presente" || g.status === "reemplazo"),
      ).length;

      const coberturaStatus = calculateCoberturaStatus(
        inst.guardiasRequeridos,
        allGuardias,
        "nocturno",
      );

      // Also sync guardiaDiaNombres for backwards compat with PDF/detail page
      const diurnos = toUpsert.filter((g) => (g.turno ?? "nocturno") === "diurno");
      const guardiaDiaNombres = diurnos.length > 0
        ? JSON.stringify(diurnos.map((g) => ({
            nombre: g.guardiaNombre,
            hora: g.horaLlegada || null,
            isExtra: g.isExtra ?? false,
          })))
        : null;
      const horaLlegadaTurnoDia = diurnos.find((g) => g.horaLlegada)?.horaLlegada || null;

      await prisma.opsControlNocturnoInstalacion.update({
        where: { id: controlInstalacionId },
        data: {
          guardiasPresentes: presentesNoche,
          coberturaStatus,
          guardiaDiaNombres,
          horaLlegadaTurnoDia,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GRID] PATCH guardias", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// ── POST: create a new guard ──
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = (await request.json()) as {
      controlInstalacionId: string;
      guardiaNombre: string;
      guardiaId?: string | null;
      isExtra?: boolean;
      turno?: string;
    };

    if (!body.controlInstalacionId || !body.guardiaNombre?.trim()) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // Verify current user is the active turno operator
    const activeTurnoPost = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, status: "active" },
      select: { operatorId: true },
    });
    if (activeTurnoPost && activeTurnoPost.operatorId !== ctx.userId) {
      return NextResponse.json(
        { success: false, error: "Solo el operador del turno activo puede realizar esta acción" },
        { status: 403 },
      );
    }

    const inst = await prisma.opsControlNocturnoInstalacion.findUnique({
      where: { id: body.controlInstalacionId },
      include: { controlNocturno: { select: { tenantId: true } } },
    });

    if (!inst || inst.controlNocturno.tenantId !== ctx.tenantId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const guardia = await prisma.opsControlNocturnoGuardia.create({
      data: {
        controlInstalacionId: body.controlInstalacionId,
        guardiaNombre: body.guardiaNombre.trim(),
        guardiaId: body.guardiaId || null,
        isExtra: body.isExtra ?? true,
        status: "pendiente",
        turno: body.turno ?? "nocturno",
        horaLlegada: null,
        reemplazaDe: null,
        notes: null,
      },
    });

    return NextResponse.json({ success: true, guardia });
  } catch (error) {
    console.error("[GRID] POST guardia", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
