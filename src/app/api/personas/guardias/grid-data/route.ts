import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";

function formatDate(value?: Date | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-CL");
}

function calculateAge(birthDate?: Date | null): string {
  if (!birthDate) return "";
  const now = new Date();
  const dob = new Date(birthDate);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}

function decimalToString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const mode = request.nextUrl.searchParams.get("mode") === "historico" ? "historico" : "activos";

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      hiredAt: { not: null },
      lifecycleStatus:
        mode === "activos"
          ? "contratado"
          : { in: ["contratado", "inactivo"] },
    };
    if (mode === "activos") {
      where.status = "active";
    }

    const guardiasRaw = await prisma.opsGuardia.findMany({
      where,
      include: {
        persona: true,
        currentInstallation: { select: { id: true, name: true } },
        asignaciones: {
          where: { isActive: true },
          orderBy: [{ startDate: "desc" }],
          include: {
            puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
            installation: { select: { name: true } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    const guardias = guardiasRaw.filter((g) => g.lifecycleStatus !== "te");

    type GridRow = Record<string, string>;
    const rows: GridRow[] = [];

    for (const guardia of guardias) {
      const baseRow: GridRow = {
        id: guardia.id,
        codigo: guardia.code ?? "",
        estadoLaboral: guardia.lifecycleStatus,
        activo: guardia.status === "active" ? "Activo" : "Inactivo",
        nombre: guardia.persona.firstName ?? "",
        apellido: guardia.persona.lastName ?? "",
        rut: guardia.persona.rut ?? "",
        nacionalidad: guardia.persona.nacionalidad ?? "",
        sexo: guardia.persona.sex ?? "",
        fechaNac: formatDate(guardia.persona.birthDate),
        edad: calculateAge(guardia.persona.birthDate),
        afp: guardia.persona.afp ?? "",
        salud:
          guardia.persona.healthSystem === "isapre"
            ? `ISAPRE${guardia.persona.isapreName ? ` · ${guardia.persona.isapreName}` : ""}`
            : (guardia.persona.healthSystem ?? ""),
        movilizacion: guardia.persona.hasMobilization ? "Sí" : "No",
        turnosExtra: guardia.availableExtraShifts ? "Sí" : "No",
        contrato: guardia.hiredAt ? "Sí" : "No",
        fechaIngreso: formatDate(guardia.hiredAt),
        fechaTermino: formatDate(guardia.terminatedAt),
        calzado: guardia.persona.shoeSize ?? "",
        pantalon: guardia.persona.pantsSize ?? "",
        polera: guardia.persona.tshirtSize ?? "",
        camisa: guardia.persona.shirtSize ?? "",
        geologo: guardia.persona.geologoSize ?? "",
        polar: guardia.persona.polarSize ?? "",
        chaqueta: guardia.persona.jacketSize ?? "",
        estatura: decimalToString(guardia.persona.heightCm),
        peso: decimalToString(guardia.persona.weightKg),
        celular: guardia.persona.phoneMobile ?? "",
        email: guardia.persona.email ?? "",
        direccion: guardia.persona.addressFormatted ?? "",
        comuna: guardia.persona.commune ?? "",
        ciudad: guardia.persona.city ?? "",
        os10: guardia.os10 ? "Sí" : "No",
        os10Expira: formatDate(guardia.os10ExpiresAt),
      };

      if (guardia.asignaciones.length > 0) {
        for (const asig of guardia.asignaciones) {
          rows.push({
            ...baseRow,
            instalacion: asig.installation?.name ?? guardia.currentInstallation?.name ?? "",
            puesto: asig.puesto?.name ?? "",
            jornada:
              asig.puesto?.shiftStart && asig.puesto?.shiftEnd
                ? `${asig.puesto.shiftStart}-${asig.puesto.shiftEnd}`
                : "",
          });
        }
      } else {
        rows.push({
          ...baseRow,
          instalacion: guardia.currentInstallation?.name ?? "",
          puesto: "",
          jornada: "",
        });
      }
    }

    // Sort by installation, then apellido, then nombre
    rows.sort((a, b) => {
      const instCmp = (a.instalacion ?? "").localeCompare(b.instalacion ?? "", "es", { sensitivity: "base" });
      if (instCmp !== 0) return instCmp;
      const lastCmp = (a.apellido ?? "").localeCompare(b.apellido ?? "", "es", { sensitivity: "base" });
      if (lastCmp !== 0) return lastCmp;
      return (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" });
    });

    // Group by installation
    const grouped: Record<string, GridRow[]> = {};
    for (const row of rows) {
      const inst = row.instalacion || "Sin instalación";
      if (!grouped[inst]) grouped[inst] = [];
      grouped[inst].push(row);
    }

    // ── PPC: dotación vs asignados por instalación ──
    const [puestosAgg, asignacionesByInst] = await Promise.all([
      prisma.opsPuestoOperativo.groupBy({
        by: ["installationId"],
        where: { tenantId: ctx.tenantId, active: true },
        _sum: { requiredGuards: true },
      }),
      prisma.opsAsignacionGuardia.groupBy({
        by: ["installationId"],
        where: { tenantId: ctx.tenantId, isActive: true },
        _count: { id: true },
      }),
    ]);

    // Map installationId → name
    const installationIds = [
      ...new Set([
        ...puestosAgg.map((p) => p.installationId),
        ...asignacionesByInst.map((a) => a.installationId),
      ]),
    ];
    const installations = await prisma.crmInstallation.findMany({
      where: { id: { in: installationIds } },
      select: { id: true, name: true },
    });
    const idToName: Record<string, string> = {};
    for (const inst of installations) {
      idToName[inst.id] = inst.name;
    }

    const dotacionMap: Record<string, number> = {};
    for (const p of puestosAgg) {
      const name = idToName[p.installationId] ?? "Sin instalación";
      dotacionMap[name] = (dotacionMap[name] ?? 0) + (p._sum.requiredGuards ?? 0);
    }

    const asignadosMap: Record<string, number> = {};
    for (const a of asignacionesByInst) {
      const name = idToName[a.installationId] ?? "Sin instalación";
      asignadosMap[name] = (asignadosMap[name] ?? 0) + a._count.id;
    }

    type InstSummary = { dotacion: number; asignados: number; ppc: number };
    const summary: Record<string, InstSummary> = {};
    const allInstNames = new Set([...Object.keys(grouped), ...Object.keys(dotacionMap)]);
    for (const name of allInstNames) {
      const dot = dotacionMap[name] ?? 0;
      const asig = asignadosMap[name] ?? 0;
      summary[name] = { dotacion: dot, asignados: asig, ppc: Math.max(0, dot - asig) };
    }

    return NextResponse.json({ success: true, data: grouped, summary });
  } catch (error) {
    console.error("[PERSONAS] Error cargando grilla de guardias:", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar la grilla" }, { status: 500 });
  }
}
