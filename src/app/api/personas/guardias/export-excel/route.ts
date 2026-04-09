import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
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
    const filter = request.nextUrl.searchParams.get("filter") || "";

    const VALID_FILTERS = ["all", "postulante", "seleccionado", "contratado", "te", "inactivo"];
    const activeFilter = VALID_FILTERS.includes(filter) ? filter : "";

    const where: any = {
      tenantId: ctx.tenantId,
    };

    if (activeFilter && activeFilter !== "contratado") {
      // New filter-based export
      if (activeFilter === "all") {
        // No lifecycle filter
      } else if (activeFilter === "inactivo") {
        where.lifecycleStatus = "inactivo";
      } else {
        where.lifecycleStatus = activeFilter;
      }
    } else {
      // Legacy mode-based export (contratado)
      where.hiredAt = { not: null };
      where.lifecycleStatus =
        mode === "activos"
          ? "contratado"
          : { in: ["contratado", "inactivo"] };
      if (mode === "activos") {
        where.status = "active";
      }
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
    const guardias = (!activeFilter || activeFilter === "contratado")
      ? guardiasRaw.filter((g) => g.lifecycleStatus !== "te")
      : guardiasRaw;

    const wb = new ExcelJS.Workbook();
    wb.creator = "OPAI";
    const ws = wb.addWorksheet("Base de Guardias");
    ws.columns = [
      { header: "Instalación", key: "instalacion", width: 28 },
      { header: "Puesto", key: "puesto", width: 20 },
      { header: "Jornada", key: "jornada", width: 16 },
      { header: "Código", key: "codigo", width: 12 },
      { header: "Estado laboral", key: "estadoLaboral", width: 16 },
      { header: "Activo/Inactivo", key: "estadoLegacy", width: 14 },
      { header: "Nombre", key: "nombre", width: 16 },
      { header: "Apellido", key: "apellido", width: 18 },
      { header: "RUT", key: "rut", width: 14 },
      { header: "Nacionalidad", key: "nacionalidad", width: 16 },
      { header: "Sexo", key: "sexo", width: 12 },
      { header: "Fecha nacimiento", key: "fechaNac", width: 14 },
      { header: "Edad", key: "edad", width: 8 },
      { header: "AFP", key: "afp", width: 12 },
      { header: "Salud", key: "salud", width: 16 },
      { header: "Movilización", key: "movilizacion", width: 14 },
      { header: "Turnos extra", key: "turnosExtra", width: 12 },
      { header: "Contrato", key: "contrato", width: 12 },
      { header: "Fecha ingreso", key: "fechaIngreso", width: 14 },
      { header: "Fecha término", key: "fechaTermino", width: 14 },
      { header: "Calzado", key: "calzado", width: 10 },
      { header: "Pantalón", key: "pantalon", width: 10 },
      { header: "Polera", key: "polera", width: 10 },
      { header: "Camisa", key: "camisa", width: 10 },
      { header: "Geólogo", key: "geologo", width: 10 },
      { header: "Polar", key: "polar", width: 10 },
      { header: "Chaqueta", key: "chaqueta", width: 10 },
      { header: "Estatura (cm)", key: "estatura", width: 12 },
      { header: "Peso (kg)", key: "peso", width: 10 },
      { header: "Celular", key: "celular", width: 14 },
      { header: "Email", key: "email", width: 28 },
      { header: "Dirección", key: "direccion", width: 36 },
      { header: "Comuna", key: "comuna", width: 16 },
      { header: "Ciudad", key: "ciudad", width: 16 },
      { header: "OS-10", key: "os10", width: 10 },
      { header: "Vencimiento OS-10", key: "os10Expira", width: 18 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2847" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });

    const exportRows: Record<string, string>[] = [];
    for (const guardia of guardias) {
      const baseRow = {
        codigo: guardia.code ?? "",
        estadoLaboral: guardia.lifecycleStatus,
        estadoLegacy: guardia.status === "active" ? "Activo" : "Inactivo",
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
          exportRows.push({
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
        exportRows.push({
          ...baseRow,
          instalacion: guardia.currentInstallation?.name ?? "",
          puesto: "",
          jornada: "",
        });
      }
    }

    exportRows.sort((a, b) => {
      const instA = (a.instalacion ?? "").toString().trim().toLowerCase();
      const instB = (b.instalacion ?? "").toString().trim().toLowerCase();
      const instCmp = instA.localeCompare(instB, "es", { sensitivity: "base" });
      if (instCmp !== 0) return instCmp;

      const lastA = (a.apellido ?? "").toString().trim().toLowerCase();
      const lastB = (b.apellido ?? "").toString().trim().toLowerCase();
      const lastCmp = lastA.localeCompare(lastB, "es", { sensitivity: "base" });
      if (lastCmp !== 0) return lastCmp;

      const firstA = (a.nombre ?? "").toString().trim().toLowerCase();
      const firstB = (b.nombre ?? "").toString().trim().toLowerCase();
      return firstA.localeCompare(firstB, "es", { sensitivity: "base" });
    });

    for (const row of exportRows) {
      ws.addRow(row);
    }

    const today = new Date().toISOString().slice(0, 10);
    const FILTER_FILENAMES: Record<string, string> = {
      all: "guardias-todos",
      postulante: "guardias-postulantes",
      seleccionado: "guardias-seleccionados",
      te: "guardias-turno-extra",
      inactivo: "guardias-inactivos",
    };
    const fileName = activeFilter && activeFilter !== "contratado"
      ? `${FILTER_FILENAMES[activeFilter] ?? `guardias-${activeFilter}`}-${today}.xlsx`
      : mode === "activos"
        ? `guardias-activos-${today}.xlsx`
        : `guardias-activos-e-inactivos-${today}.xlsx`;

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[PERSONAS] Error exportando base de guardias:", error);
    return NextResponse.json({ success: false, error: "No se pudo exportar Excel" }, { status: 500 });
  }
}
