/**
 * Test E2E: Sistema de Asistencia de Guardias — Marcación con Georreferencia
 *
 * Simula 3 días de marcaciones (entrada + salida) para el guardia RUT 13255838-8
 * en la instalación Gard, usando la misma lógica del endpoint /api/public/marcacion/registrar.
 *
 * Uso:
 *   npx tsx scripts/test-e2e-asistencia.ts
 *   npx tsx scripts/test-e2e-asistencia.ts --cleanup   (elimina marcaciones de test)
 *   npx tsx scripts/test-e2e-asistencia.ts --verify     (solo verifica estado actual)
 *
 * Requisitos:
 *   - DATABASE_URL configurado en .env.local
 *   - Guardia RUT 13255838-8 existente con PIN configurado
 *   - Instalación Gard con marcacionCode y coordenadas
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

// ── Config ──
const GUARD_RUT = "13255838-8";
const GARD_INSTALLATION_NAME = "Gard";
const GARD_DEFAULT_LAT = -33.4372;
const GARD_DEFAULT_LNG = -70.6506;
const GARD_DEFAULT_RADIUS = 100; // metros

// Días de test: 1, 2, 3 de enero 2025
const TEST_DATES = [
  new Date(Date.UTC(2025, 0, 1)), // 1 de enero
  new Date(Date.UTC(2025, 0, 2)), // 2 de enero
  new Date(Date.UTC(2025, 0, 3)), // 3 de enero
];

// ── Tipos ──
interface TestResult {
  day: number;
  date: string;
  entrada: { success: boolean; marcacionId?: string; error?: string; timestamp?: string };
  salida: { success: boolean; marcacionId?: string; error?: string; timestamp?: string };
}

interface GuardData {
  personaId: string;
  guardiaId: string;
  firstName: string;
  lastName: string;
  lifecycleStatus: string;
  marcacionPin: string | null;
  marcacionPinVisible: string | null;
  currentInstallationId: string | null;
}

interface InstallationData {
  id: string;
  tenantId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  geoRadiusM: number;
  marcacionCode: string | null;
  isActive: boolean;
}

// ── Utilidades (réplica de src/lib/marcacion.ts) ──

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function computeMarcacionHash(data: {
  guardiaId: string;
  installationId: string;
  tipo: string;
  timestamp: string;
  lat: number;
  lng: number;
  metodoId: string;
  tenantId: string;
}): string {
  const payload = [
    data.guardiaId,
    data.installationId,
    data.tipo,
    data.timestamp,
    data.lat.toString(),
    data.lng.toString(),
    data.metodoId,
    data.tenantId,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/** Añade variación GPS realista (±5-15m) a coordenadas */
function jitterCoords(lat: number, lng: number): { lat: number; lng: number } {
  const metersToDeg = 1 / 111320; // approx at equator
  const offsetM = 5 + Math.random() * 10; // 5-15 metros
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: lat + Math.cos(angle) * offsetM * metersToDeg,
    lng: lng + Math.sin(angle) * offsetM * (metersToDeg / Math.cos(toRad(lat))),
  };
}

// ── Attendance metrics (réplica de src/lib/ops-attendance.ts) ──

function parseTimeToMinutes(time: string): number | null {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function diffMinutesAcrossMidnight(start: number, end: number): number {
  return end >= start ? end - start : 24 * 60 - start + end;
}

function computeAttendanceMetrics(input: {
  plannedShiftStart?: string | null;
  plannedShiftEnd?: string | null;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
}) {
  const colacionMinutes = 60;
  let plannedMinutes = 0;
  if (input.plannedShiftStart && input.plannedShiftEnd) {
    const start = parseTimeToMinutes(input.plannedShiftStart);
    const end = parseTimeToMinutes(input.plannedShiftEnd);
    if (start != null && end != null) {
      plannedMinutes = Math.max(0, diffMinutesAcrossMidnight(start, end) - colacionMinutes);
    }
  }

  let workedMinutes = 0;
  if (input.checkInAt && input.checkOutAt) {
    let diff = Math.round((input.checkOutAt.getTime() - input.checkInAt.getTime()) / 60000);
    if (diff < 0) diff += 24 * 60;
    workedMinutes = Math.max(0, diff - colacionMinutes);
  }

  const overtimeMinutes = Math.max(0, workedMinutes - plannedMinutes);

  let lateMinutes = 0;
  if (input.checkInAt && input.plannedShiftStart) {
    const plannedStart = parseTimeToMinutes(input.plannedShiftStart);
    if (plannedStart != null) {
      const checkInMinutes = input.checkInAt.getUTCHours() * 60 + input.checkInAt.getUTCMinutes();
      lateMinutes = Math.max(0, checkInMinutes - plannedStart);
    }
  }

  return { plannedMinutes, workedMinutes, overtimeMinutes, lateMinutes };
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const isCleanup = args.includes("--cleanup");
  const isVerify = args.includes("--verify");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  TEST E2E — Sistema de Asistencia con Georreferencia");
  console.log("  Guardia: RUT " + GUARD_RUT);
  console.log("  Días: 1, 2 y 3 de Enero 2025");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── FASE 0: Investigar datos ──
  console.log("▶ FASE 0: Investigando instalación Gard y guardia...\n");

  const installation = await findGardInstallation();
  if (!installation) {
    console.error("✗ No se encontró la instalación Gard. Abortando.");
    process.exit(1);
  }
  printInstallation(installation);

  const guard = await findGuard(installation.tenantId);
  if (!guard) {
    console.error("✗ No se encontró el guardia RUT " + GUARD_RUT + ". Abortando.");
    process.exit(1);
  }
  printGuard(guard);

  // Verificar que tenga PIN
  if (!guard.marcacionPin) {
    console.error("✗ El guardia no tiene PIN de marcación configurado.");
    console.error("  Configure uno desde el panel de administración o ejecute:");
    console.error("  npx tsx -e \"import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('1234',10))\"");
    process.exit(1);
  }

  // Verificar lifecycle status
  if (!["seleccionado", "contratado"].includes(guard.lifecycleStatus)) {
    console.warn(`⚠ El guardia tiene lifecycleStatus="${guard.lifecycleStatus}", no podrá marcar.`);
    console.warn("  Se requiere 'seleccionado' o 'contratado'.");
  }

  // ── Buscar asignación activa ──
  const asignacion = await prisma.opsAsignacionGuardia.findFirst({
    where: {
      guardiaId: guard.guardiaId,
      installationId: installation.id,
      isActive: true,
    },
    include: {
      puesto: { select: { id: true, name: true, shiftStart: true, shiftEnd: true, weekdays: true } },
    },
  });

  if (asignacion) {
    console.log(`✓ Asignación activa: Puesto "${asignacion.puesto.name}"`);
    console.log(`  Turno: ${asignacion.puesto.shiftStart} - ${asignacion.puesto.shiftEnd}`);
    console.log(`  Slot: ${asignacion.slotNumber}`);
    console.log(`  Weekdays: ${asignacion.puesto.weekdays.join(", ") || "(todos)"}\n`);
  } else {
    console.warn("⚠ Sin asignación activa en esta instalación.\n");
  }

  // ── Buscar pautas para esos días ──
  console.log("▶ Investigando pautas/turnos para Enero 1-3...\n");
  for (const date of TEST_DATES) {
    const pautas = await prisma.opsPautaMensual.findMany({
      where: {
        installationId: installation.id,
        date,
        OR: [
          { plannedGuardiaId: guard.guardiaId },
          { replacementGuardiaId: guard.guardiaId },
        ],
      },
      include: {
        puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
      },
    });

    const dateStr = date.toISOString().split("T")[0];
    if (pautas.length > 0) {
      for (const p of pautas) {
        console.log(`  ${dateStr}: Puesto "${p.puesto.name}" — ${p.puesto.shiftStart}-${p.puesto.shiftEnd} (${p.shiftCode || p.status})`);
      }
    } else {
      console.log(`  ${dateStr}: Sin pauta específica.`);
    }
  }

  // ── Buscar asistencias diarias para esos días ──
  console.log("\n▶ Verificando asistencias diarias existentes...\n");
  for (const date of TEST_DATES) {
    const asistencias = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        installationId: installation.id,
        date,
        OR: [
          { plannedGuardiaId: guard.guardiaId },
          { actualGuardiaId: guard.guardiaId },
          { replacementGuardiaId: guard.guardiaId },
        ],
      },
      include: {
        puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
      },
    });

    const dateStr = date.toISOString().split("T")[0];
    if (asistencias.length > 0) {
      for (const a of asistencias) {
        console.log(`  ${dateStr}: ${a.attendanceStatus} — Puesto "${a.puesto.name}" ${a.puesto.shiftStart}-${a.puesto.shiftEnd}`);
        if (a.checkInAt) console.log(`    CheckIn:  ${a.checkInAt.toISOString()}`);
        if (a.checkOutAt) console.log(`    CheckOut: ${a.checkOutAt.toISOString()}`);
      }
    } else {
      console.log(`  ${dateStr}: Sin asistencia diaria.`);
    }
  }

  // ── Handle modes ──
  if (isCleanup) {
    await cleanup(guard.guardiaId, installation.id);
    return;
  }

  if (isVerify) {
    await verify(guard.guardiaId, installation.id);
    return;
  }

  // ── FASE 1-4: Simular marcaciones ──
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  FASE 1-4: Simulando marcaciones de 3 días");
  console.log("═══════════════════════════════════════════════════════════\n");

  const results: TestResult[] = [];

  for (let i = 0; i < TEST_DATES.length; i++) {
    const date = TEST_DATES[i];
    const dateStr = date.toISOString().split("T")[0];
    const dayNum = i + 1;

    console.log(`\n── DÍA ${dayNum}: ${dateStr} ──\n`);

    // Determinar horarios del turno
    let shiftStart = "08:00";
    let shiftEnd = "20:00";
    let puestoId: string | null = null;
    let slotNumber: number | null = null;

    // Check pauta first, then assignment
    const pauta = await prisma.opsPautaMensual.findFirst({
      where: {
        installationId: installation.id,
        date,
        OR: [
          { plannedGuardiaId: guard.guardiaId },
          { replacementGuardiaId: guard.guardiaId },
        ],
      },
      include: { puesto: { select: { id: true, shiftStart: true, shiftEnd: true } } },
    });

    if (pauta) {
      shiftStart = pauta.puesto.shiftStart;
      shiftEnd = pauta.puesto.shiftEnd;
      puestoId = pauta.puestoId;
      slotNumber = pauta.slotNumber;
      console.log(`  Pauta encontrada: ${shiftStart} - ${shiftEnd}`);
    } else if (asignacion) {
      shiftStart = asignacion.puesto.shiftStart;
      shiftEnd = asignacion.puesto.shiftEnd;
      puestoId = asignacion.puestoId;
      slotNumber = asignacion.slotNumber;
      console.log(`  Usando turno de asignación: ${shiftStart} - ${shiftEnd}`);
    } else {
      console.log(`  Sin pauta ni asignación. Usando turno default: ${shiftStart} - ${shiftEnd}`);
    }

    // Parse shift times to create timestamps
    const [entradaH, entradaM] = shiftStart.split(":").map(Number);
    const [salidaH, salidaM] = shiftEnd.split(":").map(Number);

    // Chile UTC-3 in January (CLST)
    const entradaTimestamp = new Date(Date.UTC(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
      entradaH + 3, entradaM, 0 // +3 because UTC-3
    ));

    // If shift ends before it starts, it's an overnight shift (salida next day)
    const isNightShift = salidaH < entradaH;
    const salidaDate = isNightShift
      ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, salidaH + 3, salidaM, 0))
      : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), salidaH + 3, salidaM, 0));

    const result: TestResult = {
      day: dayNum,
      date: dateStr,
      entrada: { success: false },
      salida: { success: false },
    };

    // ── MARCAR ENTRADA ──
    console.log(`  Marcando ENTRADA a las ${shiftStart} Chile...`);
    try {
      const entradaResult = await registrarMarcacion({
        guardiaId: guard.guardiaId,
        installationId: installation.id,
        tenantId: installation.tenantId,
        puestoId,
        slotNumber,
        tipo: "entrada",
        timestamp: entradaTimestamp,
        installationLat: installation.lat ?? GARD_DEFAULT_LAT,
        installationLng: installation.lng ?? GARD_DEFAULT_LNG,
        shiftStart,
        shiftEnd,
        date,
      });
      result.entrada = { success: true, marcacionId: entradaResult.id, timestamp: entradaTimestamp.toISOString() };
      console.log(`  ✓ Entrada registrada: ID=${entradaResult.id}`);
      console.log(`    Timestamp: ${entradaTimestamp.toISOString()}`);
      console.log(`    Geo validada: ${entradaResult.geoValidada} (${entradaResult.geoDistanciaM}m)`);
    } catch (err: any) {
      result.entrada = { success: false, error: err.message };
      console.error(`  ✗ Error en entrada: ${err.message}`);
    }

    // ── MARCAR SALIDA ──
    console.log(`  Marcando SALIDA a las ${shiftEnd} Chile...`);
    try {
      const salidaResult = await registrarMarcacion({
        guardiaId: guard.guardiaId,
        installationId: installation.id,
        tenantId: installation.tenantId,
        puestoId,
        slotNumber,
        tipo: "salida",
        timestamp: salidaDate,
        installationLat: installation.lat ?? GARD_DEFAULT_LAT,
        installationLng: installation.lng ?? GARD_DEFAULT_LNG,
        shiftStart,
        shiftEnd,
        date,
      });
      result.salida = { success: true, marcacionId: salidaResult.id, timestamp: salidaDate.toISOString() };
      console.log(`  ✓ Salida registrada: ID=${salidaResult.id}`);
      console.log(`    Timestamp: ${salidaDate.toISOString()}`);
      console.log(`    Geo validada: ${salidaResult.geoValidada} (${salidaResult.geoDistanciaM}m)`);
    } catch (err: any) {
      result.salida = { success: false, error: err.message };
      console.error(`  ✗ Error en salida: ${err.message}`);
    }

    results.push(result);
  }

  // ── FASE 5-6: Validación ──
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  FASE 5-6: Validación en Base de Datos");
  console.log("═══════════════════════════════════════════════════════════\n");

  await verify(guard.guardiaId, installation.id);

  // ── Resumen final ──
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  RESUMEN FINAL");
  console.log("═══════════════════════════════════════════════════════════\n");

  const totalMarcaciones = results.reduce(
    (acc, r) => acc + (r.entrada.success ? 1 : 0) + (r.salida.success ? 1 : 0),
    0
  );
  const totalErrores = results.reduce(
    (acc, r) => acc + (r.entrada.success ? 0 : 1) + (r.salida.success ? 0 : 1),
    0
  );

  console.log(`  Total marcaciones exitosas: ${totalMarcaciones}/6`);
  console.log(`  Total errores: ${totalErrores}`);
  console.log(`  Resultado: ${totalMarcaciones === 6 ? "✓ EXITOSO" : "✗ PARCIAL"}`);

  for (const r of results) {
    console.log(`\n  Día ${r.day} (${r.date}):`);
    console.log(`    Entrada: ${r.entrada.success ? "✓ " + r.entrada.marcacionId : "✗ " + r.entrada.error}`);
    console.log(`    Salida:  ${r.salida.success ? "✓ " + r.salida.marcacionId : "✗ " + r.salida.error}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════\n");
}

// ══════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ══════════════════════════════════════════════════════════════

async function findGardInstallation(): Promise<InstallationData | null> {
  // Try exact match first, then partial
  let inst = await prisma.crmInstallation.findFirst({
    where: { name: { equals: GARD_INSTALLATION_NAME, mode: "insensitive" }, isActive: true },
    select: { id: true, tenantId: true, name: true, lat: true, lng: true, geoRadiusM: true, marcacionCode: true, isActive: true },
  });

  if (!inst) {
    inst = await prisma.crmInstallation.findFirst({
      where: { name: { contains: "gard", mode: "insensitive" }, isActive: true },
      select: { id: true, tenantId: true, name: true, lat: true, lng: true, geoRadiusM: true, marcacionCode: true, isActive: true },
    });
  }

  // If still no match, try any installation
  if (!inst) {
    inst = await prisma.crmInstallation.findFirst({
      where: { name: { contains: "gard", mode: "insensitive" } },
      select: { id: true, tenantId: true, name: true, lat: true, lng: true, geoRadiusM: true, marcacionCode: true, isActive: true },
    });
  }

  return inst;
}

async function findGuard(tenantId: string): Promise<GuardData | null> {
  const persona = await prisma.opsPersona.findFirst({
    where: { rut: GUARD_RUT, tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardia: {
        select: {
          id: true,
          lifecycleStatus: true,
          marcacionPin: true,
          marcacionPinVisible: true,
          currentInstallationId: true,
        },
      },
    },
  });

  if (!persona?.guardia) {
    // Try without tenant filter
    const personaAny = await prisma.opsPersona.findFirst({
      where: { rut: GUARD_RUT },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardia: {
          select: {
            id: true,
            lifecycleStatus: true,
            marcacionPin: true,
            marcacionPinVisible: true,
            currentInstallationId: true,
          },
        },
      },
    });
    if (!personaAny?.guardia) return null;
    return {
      personaId: personaAny.id,
      guardiaId: personaAny.guardia.id,
      firstName: personaAny.firstName,
      lastName: personaAny.lastName,
      lifecycleStatus: personaAny.guardia.lifecycleStatus,
      marcacionPin: personaAny.guardia.marcacionPin,
      marcacionPinVisible: personaAny.guardia.marcacionPinVisible,
      currentInstallationId: personaAny.guardia.currentInstallationId,
    };
  }

  return {
    personaId: persona.id,
    guardiaId: persona.guardia.id,
    firstName: persona.firstName,
    lastName: persona.lastName,
    lifecycleStatus: persona.guardia.lifecycleStatus,
    marcacionPin: persona.guardia.marcacionPin,
    marcacionPinVisible: persona.guardia.marcacionPinVisible,
    currentInstallationId: persona.guardia.currentInstallationId,
  };
}

function printInstallation(inst: InstallationData) {
  console.log(`✓ Instalación encontrada: "${inst.name}"`);
  console.log(`  ID: ${inst.id}`);
  console.log(`  TenantId: ${inst.tenantId}`);
  console.log(`  Activa: ${inst.isActive}`);
  console.log(`  Coordenadas: ${inst.lat ?? "N/A"}, ${inst.lng ?? "N/A"}`);
  console.log(`  Radio geofencing: ${inst.geoRadiusM}m`);
  console.log(`  Código marcación: ${inst.marcacionCode ?? "N/A"}\n`);
}

function printGuard(guard: GuardData) {
  console.log(`✓ Guardia encontrado: ${guard.lastName} ${guard.firstName} (RUT ${GUARD_RUT})`);
  console.log(`  PersonaId: ${guard.personaId}`);
  console.log(`  GuardiaId: ${guard.guardiaId}`);
  console.log(`  Lifecycle: ${guard.lifecycleStatus}`);
  console.log(`  PIN configurado: ${guard.marcacionPin ? "Sí" : "No"}`);
  console.log(`  PIN visible: ${guard.marcacionPinVisible ?? "N/A"}`);
  console.log(`  Instalación actual: ${guard.currentInstallationId ?? "N/A"}\n`);
}

async function registrarMarcacion(params: {
  guardiaId: string;
  installationId: string;
  tenantId: string;
  puestoId: string | null;
  slotNumber: number | null;
  tipo: "entrada" | "salida";
  timestamp: Date;
  installationLat: number;
  installationLng: number;
  shiftStart: string;
  shiftEnd: string;
  date: Date;
}): Promise<{ id: string; geoValidada: boolean; geoDistanciaM: number }> {
  const { guardiaId, installationId, tenantId, puestoId, slotNumber, tipo, timestamp } = params;

  // Generate GPS coords with realistic jitter (within geofence)
  const coords = jitterCoords(params.installationLat, params.installationLng);
  const geoDistanciaM = Math.round(haversineDistance(coords.lat, coords.lng, params.installationLat, params.installationLng));
  const geoValidada = geoDistanciaM <= GARD_DEFAULT_RADIUS;

  // Hash de integridad
  const hashIntegridad = computeMarcacionHash({
    guardiaId,
    installationId,
    tipo,
    timestamp: timestamp.toISOString(),
    lat: coords.lat,
    lng: coords.lng,
    metodoId: "rut_pin",
    tenantId,
  });

  // Calcular atraso
  let atrasoMinutos: number | null = null;
  if (tipo === "entrada" && params.shiftStart) {
    const match = params.shiftStart.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const shiftH = parseInt(match[1], 10);
      const shiftM = parseInt(match[2], 10);
      const d = new Date(timestamp);
      const shiftStartUTC = new Date(Date.UTC(
        d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
        shiftH + 3, shiftM, 0 // +3 UTC-3 Chile
      ));
      if (timestamp > shiftStartUTC) {
        atrasoMinutos = Math.floor((timestamp.getTime() - shiftStartUTC.getTime()) / 60_000);
      }
    }
  }

  // Transaction: crear marcación + actualizar asistencia diaria
  const result = await prisma.$transaction(async (tx) => {
    // 1. Crear OpsMarcacion
    const marcacion = await tx.opsMarcacion.create({
      data: {
        tenantId,
        guardiaId,
        installationId,
        puestoId: puestoId ?? undefined,
        slotNumber: slotNumber ?? undefined,
        tipo,
        timestamp,
        lat: coords.lat,
        lng: coords.lng,
        geoValidada,
        geoDistanciaM,
        metodoId: "rut_pin",
        hashIntegridad,
        atrasoMinutos,
        ipAddress: "test-e2e-script",
        userAgent: "OPAI E2E Test Script v1.0",
      },
    });

    // 2. Buscar y actualizar OpsAsistenciaDiaria
    const todayDate = params.date;

    // Check replacement first
    const asistenciaReemplazo = await tx.opsAsistenciaDiaria.findFirst({
      where: {
        installationId,
        date: todayDate,
        replacementGuardiaId: guardiaId,
        attendanceStatus: "reemplazo",
      },
      include: {
        puesto: { select: { shiftStart: true, shiftEnd: true } },
      },
    });

    // Then check regular slot
    const asistencia = asistenciaReemplazo
      ?? (puestoId
        ? await tx.opsAsistenciaDiaria.findFirst({
            where: {
              installationId,
              puestoId,
              slotNumber: slotNumber ?? 1,
              date: todayDate,
              OR: [
                { plannedGuardiaId: guardiaId },
                { actualGuardiaId: guardiaId },
              ],
            },
            include: {
              puesto: { select: { shiftStart: true, shiftEnd: true } },
            },
          })
        : null);

    if (asistencia) {
      const isReplacementRow = asistencia.replacementGuardiaId === guardiaId
        && asistencia.attendanceStatus === "reemplazo";

      const updateData: Record<string, unknown> = {};
      if (tipo === "entrada") {
        updateData.checkInAt = timestamp;
        updateData.checkInSource = "digital";
        if (!isReplacementRow && asistencia.attendanceStatus === "pendiente") {
          updateData.attendanceStatus = "asistio";
          updateData.actualGuardiaId = guardiaId;
        }
      } else {
        updateData.checkOutAt = timestamp;
        updateData.checkOutSource = "digital";
      }

      const metrics = computeAttendanceMetrics({
        plannedShiftStart: asistencia.plannedShiftStart ?? asistencia.puesto.shiftStart,
        plannedShiftEnd: asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd,
        checkInAt: tipo === "entrada" ? timestamp : asistencia.checkInAt,
        checkOutAt: tipo === "salida" ? timestamp : asistencia.checkOutAt,
      });
      updateData.plannedMinutes = metrics.plannedMinutes;
      updateData.workedMinutes = metrics.workedMinutes;
      updateData.overtimeMinutes = metrics.overtimeMinutes;
      updateData.lateMinutes = metrics.lateMinutes;
      updateData.hoursCalculatedAt = new Date();

      await tx.opsAsistenciaDiaria.update({
        where: { id: asistencia.id },
        data: updateData,
      });
      console.log(`    → Asistencia diaria actualizada (ID: ${asistencia.id})`);
    } else {
      console.log(`    → Sin registro de asistencia diaria para actualizar.`);
    }

    return marcacion;
  });

  return { id: result.id, geoValidada, geoDistanciaM };
}

async function verify(guardiaId: string, installationId: string) {
  console.log("Verificando registros de marcación en BD...\n");

  const marcaciones = await prisma.opsMarcacion.findMany({
    where: {
      guardiaId,
      installationId,
      timestamp: {
        gte: new Date(Date.UTC(2025, 0, 1)),
        lt: new Date(Date.UTC(2025, 0, 4)),
      },
    },
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      tipo: true,
      timestamp: true,
      lat: true,
      lng: true,
      geoValidada: true,
      geoDistanciaM: true,
      hashIntegridad: true,
      atrasoMinutos: true,
      metodoId: true,
    },
  });

  console.log(`  Total marcaciones encontradas: ${marcaciones.length} (esperadas: 6)\n`);

  for (const m of marcaciones) {
    console.log(`  [${m.tipo.toUpperCase().padEnd(7)}] ${m.timestamp.toISOString()}`);
    console.log(`    ID: ${m.id}`);
    console.log(`    Coords: ${m.lat?.toFixed(6)}, ${m.lng?.toFixed(6)}`);
    console.log(`    Geo validada: ${m.geoValidada} (${m.geoDistanciaM}m)`);
    console.log(`    Hash: ${m.hashIntegridad.slice(0, 16)}...`);
    if (m.atrasoMinutos != null) console.log(`    Atraso: ${m.atrasoMinutos} min`);
    console.log();
  }

  // Verify asistencia diaria
  const asistencias = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      installationId,
      date: { gte: new Date(Date.UTC(2025, 0, 1)), lte: new Date(Date.UTC(2025, 0, 3)) },
      OR: [
        { plannedGuardiaId: guardiaId },
        { actualGuardiaId: guardiaId },
        { replacementGuardiaId: guardiaId },
      ],
    },
    orderBy: { date: "asc" },
    include: {
      puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
    },
  });

  if (asistencias.length > 0) {
    console.log("  Asistencia Diaria:\n");
    for (const a of asistencias) {
      console.log(`  [${(a.date as Date).toISOString().split("T")[0]}] ${a.attendanceStatus}`);
      console.log(`    Puesto: ${a.puesto.name} (${a.puesto.shiftStart}-${a.puesto.shiftEnd})`);
      console.log(`    CheckIn:  ${a.checkInAt?.toISOString() ?? "N/A"} (${a.checkInSource})`);
      console.log(`    CheckOut: ${a.checkOutAt?.toISOString() ?? "N/A"} (${a.checkOutSource})`);
      console.log(`    Minutos: planificado=${a.plannedMinutes} trabajado=${a.workedMinutes} extra=${a.overtimeMinutes} atraso=${a.lateMinutes}`);
      console.log();
    }
  }

  // Validation checks
  const issues: string[] = [];
  if (marcaciones.length !== 6) {
    issues.push(`Marcaciones: ${marcaciones.length}/6 (${6 - marcaciones.length} faltantes)`);
  }

  const entradas = marcaciones.filter((m) => m.tipo === "entrada");
  const salidas = marcaciones.filter((m) => m.tipo === "salida");
  if (entradas.length !== 3) issues.push(`Entradas: ${entradas.length}/3`);
  if (salidas.length !== 3) issues.push(`Salidas: ${salidas.length}/3`);

  for (const m of marcaciones) {
    if (!m.geoValidada) issues.push(`Marcación ${m.id} no tiene geo validada`);
    if (!m.hashIntegridad) issues.push(`Marcación ${m.id} sin hash de integridad`);
  }

  if (issues.length === 0) {
    console.log("  ✓ VALIDACIÓN COMPLETA: Todos los registros son correctos.\n");
  } else {
    console.log("  ⚠ Issues encontrados:");
    for (const i of issues) console.log(`    - ${i}`);
    console.log();
  }
}

async function cleanup(guardiaId: string, installationId: string) {
  console.log("Limpiando marcaciones de test (Enero 1-3, 2025)...\n");

  const deleted = await prisma.opsMarcacion.deleteMany({
    where: {
      guardiaId,
      installationId,
      timestamp: {
        gte: new Date(Date.UTC(2025, 0, 1)),
        lt: new Date(Date.UTC(2025, 0, 4)),
      },
      userAgent: "OPAI E2E Test Script v1.0",
    },
  });

  console.log(`  Eliminadas: ${deleted.count} marcaciones de test.`);

  // Reset asistencia diaria
  const asistencias = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      installationId,
      date: { gte: new Date(Date.UTC(2025, 0, 1)), lte: new Date(Date.UTC(2025, 0, 3)) },
      OR: [{ actualGuardiaId: guardiaId }, { plannedGuardiaId: guardiaId }],
      checkInSource: "digital",
    },
    select: { id: true },
  });

  if (asistencias.length > 0) {
    await prisma.opsAsistenciaDiaria.updateMany({
      where: { id: { in: asistencias.map((a) => a.id) } },
      data: {
        checkInAt: null,
        checkOutAt: null,
        checkInSource: "none",
        checkOutSource: "none",
        workedMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
        hoursCalculatedAt: null,
      },
    });
    console.log(`  Reseteadas: ${asistencias.length} asistencias diarias.\n`);
  }

  console.log("  ✓ Cleanup completado.\n");
}

// ── Run ──
main()
  .catch((err) => {
    console.error("\n✗ Error fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
