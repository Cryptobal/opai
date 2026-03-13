/**
 * Diagnóstico V3: ¿De dónde vienen los guardias fantasma?
 *
 * Para cada guardia que está en el grid pero NO en la pauta,
 * investigar: ¿viene de asignaciones? ¿de un CN anterior?
 * ¿Cuándo fue creado este CN? ¿Cuándo fue el último turno start?
 *
 * npx tsx scripts/diagnose-ghosts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function turnoFromShift(shiftStart: string): "nocturno" | "diurno" {
  const hour = parseInt(shiftStart.split(":")[0], 10);
  return hour >= 18 || hour < 4 ? "nocturno" : "diurno";
}

async function main() {
  const tenantId = "clgard00000000000000001";
  const dateNoc = new Date("2026-03-11T00:00:00.000Z");

  // ══════════════════════════════════════════════════════════════
  // 1. CN metadata
  // ══════════════════════════════════════════════════════════════
  const cn = await prisma.opsControlNocturno.findFirst({
    where: { tenantId, date: dateNoc },
    select: {
      id: true, date: true, status: true, createdAt: true, createdBy: true,
      monitoreoTurno: {
        select: { id: true, status: true, startedAt: true, operatorName: true, createdAt: true }
      },
    },
  });

  if (!cn) {
    console.log("No hay CN para 2026-03-11");
    return;
  }

  console.log("═".repeat(100));
  console.log("  1. METADATA DEL CONTROL NOCTURNO");
  console.log("═".repeat(100));
  console.log(`  CN ID: ${cn.id}`);
  console.log(`  CN createdAt: ${cn.createdAt}`);
  console.log(`  CN status: ${cn.status}`);
  if (cn.monitoreoTurno) {
    console.log(`  Turno ID: ${cn.monitoreoTurno.id}`);
    console.log(`  Turno startedAt: ${cn.monitoreoTurno.startedAt}`);
    console.log(`  Turno status: ${cn.monitoreoTurno.status}`);
    console.log(`  Turno operator: ${cn.monitoreoTurno.operatorName}`);
    console.log(`  Turno createdAt: ${cn.monitoreoTurno.createdAt}`);
  } else {
    console.log(`  ⚠️ No hay turno vinculado al CN`);
  }

  // ══════════════════════════════════════════════════════════════
  // 2. Para instalaciones con discrepancia, investigar guardias fantasma
  // ══════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(100));
  console.log("  2. INVESTIGACIÓN DE GUARDIAS FANTASMA");
  console.log("═".repeat(100));

  const problemInstallations = [
    "Pine", "Transmat", "Paper graneros", "Metropolitan",
    "EW-Quilicura", "Fapama quinta normal", "Fapama reñaca",
    "Paper requinoa" // extra diurno
  ];

  const cnFull = await prisma.opsControlNocturno.findFirst({
    where: { id: cn.id },
    include: {
      instalaciones: {
        include: {
          guardias: { orderBy: { createdAt: "asc" } },
          installation: { select: { id: true, name: true } },
        },
      },
    },
  });

  for (const instName of problemInstallations) {
    const cnInst = cnFull?.instalaciones.find(i =>
      i.installationName.toLowerCase().includes(instName.toLowerCase())
    );

    if (!cnInst) {
      console.log(`\n  ❌ ${instName}: no encontrada en CN`);
      continue;
    }

    console.log(`\n  ┌─ ${instName} (installationId: ${cnInst.installationId})`);
    console.log(`  │  guardiasRequeridos: ${cnInst.guardiasRequeridos}`);

    // Get pauta for this installation
    const pautaEntries = cnInst.installationId ? await prisma.opsPautaMensual.findMany({
      where: {
        tenantId,
        installationId: cnInst.installationId,
        date: dateNoc,
      },
      include: {
        puesto: { select: { name: true, shiftStart: true } },
        plannedGuardia: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
      },
    }) : [];

    const pautaWorking = pautaEntries.filter(e => e.shiftCode === "T");
    const pautaNocWorking = pautaWorking.filter(e => turnoFromShift(e.puesto.shiftStart) === "nocturno");
    const pautaDiuWorking = pautaWorking.filter(e => turnoFromShift(e.puesto.shiftStart) === "diurno");

    console.log(`  │  Pauta 11-mar: ${pautaEntries.length} entries total, ${pautaWorking.length} working (${pautaNocWorking.length} noc, ${pautaDiuWorking.length} diu)`);

    // Get asignaciones for this installation
    const asignaciones = cnInst.installationId ? await prisma.opsAsignacionGuardia.findMany({
      where: { tenantId, installationId: cnInst.installationId, isActive: true },
      include: {
        guardia: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
        puesto: { select: { name: true, shiftStart: true } },
      },
    }) : [];

    console.log(`  │  Asignaciones activas: ${asignaciones.length}`);
    for (const a of asignaciones) {
      const turno = a.puesto?.shiftStart ? turnoFromShift(a.puesto.shiftStart) : "nocturno";
      console.log(`  │    ${a.guardia.persona.firstName} ${a.guardia.persona.lastName} | puesto: ${a.puesto?.name} (${a.puesto?.shiftStart}) → ${turno} | guardiaId: ${a.guardiaId}`);
    }

    // Get previous CN for this installation
    const prevCnInst = cnInst.installationId ? await prisma.opsControlNocturnoInstalacion.findFirst({
      where: {
        installationId: cnInst.installationId,
        controlNocturno: { tenantId, date: { lt: dateNoc } },
      },
      orderBy: { controlNocturno: { date: "desc" } },
      include: {
        guardias: { orderBy: { guardiaNombre: "asc" } },
        controlNocturno: { select: { date: true } },
      },
    }) : null;

    if (prevCnInst) {
      console.log(`  │  CN anterior (${prevCnInst.controlNocturno.date.toISOString().split('T')[0]}):`);
      for (const g of prevCnInst.guardias) {
        console.log(`  │    ${g.guardiaNombre} | turno: ${g.turno} | status: ${g.status} | guardiaId: ${g.guardiaId}`);
      }
    }

    // Show grid guards with creation timestamps
    console.log(`  │`);
    console.log(`  │  Guardias en GRID (con timestamp de creación):`);
    for (const g of cnInst.guardias) {
      // Check if this guard is in pauta working
      const inPauta = pautaWorking.some(p => {
        const gId = (p.replacementGuardia ?? p.plannedGuardia)?.id;
        return gId === g.guardiaId;
      });

      // Check if in asignaciones
      const inAsig = asignaciones.some(a => a.guardiaId === g.guardiaId);

      // Check if in previous CN
      const inPrevCN = prevCnInst?.guardias.some(pg => pg.guardiaId === g.guardiaId);

      let source = "❓ DESCONOCIDO";
      if (inPauta) source = "✅ PAUTA";
      else if (inAsig) source = "⚡ ASIGNACIÓN";
      else if (inPrevCN) source = "📋 CN ANTERIOR";

      const ghost = inPauta ? "" : " 👻 FANTASMA";
      console.log(`  │    ${g.guardiaNombre} | ${g.turno} | createdAt: ${g.createdAt} | source: ${source}${ghost}`);
    }

    console.log(`  └─`);
  }

  // ══════════════════════════════════════════════════════════════
  // 3. Resumen: ¿cuántos guardias fantasma hay en total?
  // ══════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(100));
  console.log("  3. RESUMEN GENERAL");
  console.log("═".repeat(100));

  let totalGuards = 0;
  let totalGhosts = 0;

  for (const cnInst of cnFull?.instalaciones ?? []) {
    const pautaWorking = cnInst.installationId ? await prisma.opsPautaMensual.findMany({
      where: {
        tenantId,
        installationId: cnInst.installationId,
        date: dateNoc,
        shiftCode: "T",
      },
      select: { plannedGuardiaId: true, replacementGuardiaId: true },
    }) : [];

    const pautaGuardIds = new Set(
      pautaWorking.map(p => p.replacementGuardiaId ?? p.plannedGuardiaId).filter(Boolean)
    );

    for (const g of cnInst.guardias) {
      totalGuards++;
      if (g.guardiaId && !pautaGuardIds.has(g.guardiaId)) {
        totalGhosts++;
      }
    }
  }

  console.log(`\n  Total guardias en grid: ${totalGuards}`);
  console.log(`  Guardias fantasma (no en pauta T de hoy): ${totalGhosts}`);
  console.log(`  Porcentaje correcto: ${Math.round(((totalGuards - totalGhosts) / totalGuards) * 100)}%`);

  console.log("\n\nDiagnóstico completado.\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
