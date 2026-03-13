/**
 * Diagnóstico V2: Grid Operativo vs Pauta Diaria
 *
 * Investiga TODOS los shiftCodes (no solo "T") y compara
 * pauta real vs grid para nocturno 11/3 y día 12/3.
 *
 * npx tsx scripts/diagnose-grid-v2.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function turnoFromShift(shiftStart: string): "nocturno" | "diurno" {
  const hour = parseInt(shiftStart.split(":")[0], 10);
  return hour >= 18 || hour < 4 ? "nocturno" : "diurno";
}

function fmtName(first: string | null, last: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim() || "(sin nombre)";
}

async function main() {
  const tenantId = "clgard00000000000000001";

  const dateNoc = new Date("2026-03-11T00:00:00.000Z");
  const dateDia = new Date("2026-03-12T00:00:00.000Z");

  console.log("═".repeat(100));
  console.log("  INVESTIGACIÓN REAL — Fecha nocturno: 2026-03-11 | Fecha día: 2026-03-12");
  console.log("═".repeat(100));

  // ══════════════════════════════════════════════════════════════
  // PASO 1: Ver TODOS los shiftCodes distintos que existen
  // ══════════════════════════════════════════════════════════════
  const allCodes11 = await prisma.$queryRaw<Array<{shift_code: string | null, cnt: bigint}>>`
    SELECT shift_code, COUNT(*) as cnt
    FROM ops.pauta_mensual
    WHERE tenant_id = ${tenantId} AND date = '2026-03-11'
    GROUP BY shift_code
    ORDER BY shift_code
  `;
  console.log("\n📊 ShiftCodes en pauta para 2026-03-11:");
  for (const row of allCodes11) {
    console.log(`   ${row.shift_code ?? 'NULL'}: ${row.cnt} entradas`);
  }

  const allCodes12 = await prisma.$queryRaw<Array<{shift_code: string | null, cnt: bigint}>>`
    SELECT shift_code, COUNT(*) as cnt
    FROM ops.pauta_mensual
    WHERE tenant_id = ${tenantId} AND date = '2026-03-12'
    GROUP BY shift_code
    ORDER BY shift_code
  `;
  console.log("\n📊 ShiftCodes en pauta para 2026-03-12:");
  for (const row of allCodes12) {
    console.log(`   ${row.shift_code ?? 'NULL'}: ${row.cnt} entradas`);
  }

  // ══════════════════════════════════════════════════════════════
  // PASO 2: Pauta COMPLETA para cada instalación, mostrando
  //         TODOS los shift codes (T, Td, Tn, -, etc.)
  // ══════════════════════════════════════════════════════════════

  // Helper: get full pauta for a date
  async function getPautaForDate(date: Date) {
    return prisma.opsPautaMensual.findMany({
      where: { tenantId, date },
      include: {
        puesto: { select: { id: true, name: true, shiftStart: true, shiftEnd: true } },
        installation: { select: { id: true, name: true } },
        plannedGuardia: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
        replacementGuardia: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ installation: { name: "asc" } }, { puesto: { name: "asc" } }, { slotNumber: "asc" }],
    });
  }

  const pauta11 = await getPautaForDate(dateNoc);
  const pauta12 = await getPautaForDate(dateDia);

  // Group by installation
  type PEntry = typeof pauta11[number];
  function groupByInst(entries: PEntry[]): Map<string, { instId: string; entries: PEntry[] }> {
    const map = new Map<string, { instId: string; entries: PEntry[] }>();
    for (const e of entries) {
      const key = e.installation.name;
      if (!map.has(key)) map.set(key, { instId: e.installationId, entries: [] });
      map.get(key)!.entries.push(e);
    }
    return map;
  }

  const byInst11 = groupByInst(pauta11);
  const byInst12 = groupByInst(pauta12);

  // Which shift codes count as "working"?
  // T = trabajo genérico, Td = trabajo diurno, Tn = trabajo nocturno
  const WORKING_CODES = new Set(["T", "Td", "Tn"]);

  function isWorking(code: string | null): boolean {
    return code != null && WORKING_CODES.has(code);
  }

  // ══════════════════════════════════════════════════════════════
  // PASO 3: Para cada instalación, qué dice la pauta
  // ══════════════════════════════════════════════════════════════

  // Get all nocturno-enabled installations
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, isActive: true, nocturnoEnabled: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Build the expected guards per installation
  interface ExpectedGuard {
    nombre: string;
    turno: "nocturno" | "diurno";
    shiftCode: string | null;
    puestoName: string;
    isReplacement: boolean;
  }

  function extractGuards(entries: PEntry[]): ExpectedGuard[] {
    const guards: ExpectedGuard[] = [];
    for (const e of entries) {
      if (!isWorking(e.shiftCode)) continue;
      const turno = turnoFromShift(e.puesto.shiftStart);
      const effective = e.replacementGuardia ?? e.plannedGuardia;
      const nombre = effective
        ? fmtName(effective.persona.firstName, effective.persona.lastName)
        : "PPC (sin guardia)";
      guards.push({
        nombre,
        turno,
        shiftCode: e.shiftCode,
        puestoName: e.puesto.name,
        isReplacement: !!e.replacementGuardia,
      });
    }
    return guards;
  }

  // ══════════════════════════════════════════════════════════════
  // PASO 4: Grid operativo (CN) para 11 de marzo
  // ══════════════════════════════════════════════════════════════
  const cn = await prisma.opsControlNocturno.findFirst({
    where: { tenantId, date: dateNoc },
    include: {
      instalaciones: {
        orderBy: { orderIndex: "asc" },
        include: {
          guardias: { orderBy: { guardiaNombre: "asc" } },
          installation: { select: { id: true, name: true } },
        },
      },
    },
  });

  interface GridGuard {
    nombre: string;
    turno: string;
    status: string;
    guardiaId: string | null;
    isExtra: boolean;
  }

  // ══════════════════════════════════════════════════════════════
  // PASO 5: TABLA COMPARATIVA — TURNO NOCTURNO 11 MARZO
  // ══════════════════════════════════════════════════════════════
  console.log("\n\n" + "═".repeat(100));
  console.log("  TABLA 1: TURNO NOCTURNO — 11 MARZO 2026");
  console.log("  Pauta fecha: 2026-03-11 | Filtro: puestos con shiftStart >= 18:00 o < 04:00 + shiftCode trabajando");
  console.log("═".repeat(100));

  for (const inst of installations) {
    const pautaData = byInst11.get(inst.name);
    const pautaEntries = pautaData?.entries ?? [];
    const allGuards = extractGuards(pautaEntries);
    const pautaNocturnos = allGuards.filter(g => g.turno === "nocturno");

    // Also show ALL pauta entries for this installation to see codes
    const allNocturnoEntries = pautaEntries.filter(e => turnoFromShift(e.puesto.shiftStart) === "nocturno");

    const cnInst = cn?.instalaciones.find(i => i.installationId === inst.id);
    const gridNocturnos = cnInst?.guardias.filter(g => g.turno === "nocturno") ?? [];

    // Only show if there's something interesting
    if (pautaNocturnos.length === 0 && gridNocturnos.length === 0 && allNocturnoEntries.length === 0) continue;

    console.log(`\n  ┌─ ${inst.name}`);

    // Show all pauta nocturno entries (including rest days)
    if (allNocturnoEntries.length > 0) {
      console.log(`  │  PAUTA 11-mar (todos los puestos nocturnos):`);
      for (const e of allNocturnoEntries) {
        const g = e.replacementGuardia ?? e.plannedGuardia;
        const nombre = g ? fmtName(g.persona.firstName, g.persona.lastName) : "SIN GUARDIA";
        const repl = e.replacementGuardia ? " [REEMP]" : "";
        const working = isWorking(e.shiftCode) ? "✅" : "⬜";
        console.log(`  │    ${working} S${e.slotNumber} ${e.puesto.name} (${e.puesto.shiftStart}-${e.puesto.shiftEnd}) | code=${e.shiftCode ?? 'NULL'} | ${nombre}${repl}`);
      }
      console.log(`  │    → Guardias nocturno TRABAJANDO: ${pautaNocturnos.length}`);
    } else {
      console.log(`  │  PAUTA 11-mar: Sin puestos nocturnos en pauta`);
    }

    // Show grid
    if (cnInst) {
      console.log(`  │  GRID guardiasRequeridos=${cnInst.guardiasRequeridos} | cobertura=${cnInst.coberturaStatus}`);
      if (gridNocturnos.length > 0) {
        console.log(`  │  GRID nocturnos:`);
        for (const g of gridNocturnos) {
          console.log(`  │    ${g.guardiaNombre} | status=${g.status} | guardiaId=${g.guardiaId ?? 'null'}`);
        }
      } else {
        console.log(`  │  GRID nocturnos: (ninguno)`);
      }
    } else {
      console.log(`  │  GRID: ❌ No existe en Control Nocturno`);
    }

    // Compare
    const pautaCount = pautaNocturnos.length;
    const gridCount = gridNocturnos.length;
    const gridReq = cnInst?.guardiasRequeridos ?? 0;

    if (gridReq !== pautaCount) {
      console.log(`  │  ⚠️ DISCREPANCIA: guardiasRequeridos=${gridReq} pero pauta dice ${pautaCount}`);
    }
    if (gridCount !== pautaCount) {
      console.log(`  │  ⚠️ DISCREPANCIA: grid tiene ${gridCount} guardias, pauta dice ${pautaCount}`);
    }

    console.log(`  └─`);
  }

  // ══════════════════════════════════════════════════════════════
  // PASO 6: TABLA COMPARATIVA — TURNO DÍA 12 MARZO
  // ══════════════════════════════════════════════════════════════
  console.log("\n\n" + "═".repeat(100));
  console.log("  TABLA 2: TURNO DÍA — 12 MARZO 2026");
  console.log("  Pauta fecha: 2026-03-12 | Filtro: puestos con shiftStart 04:00-17:59 + shiftCode trabajando");
  console.log("  Grid: columna 'Gdia. Día' del CN del 11 de marzo (usa fecha CN = 11-mar para buscar diurnos)");
  console.log("═".repeat(100));

  for (const inst of installations) {
    const pautaData12 = byInst12.get(inst.name);
    const pautaEntries12 = pautaData12?.entries ?? [];
    const allGuards12 = extractGuards(pautaEntries12);
    const pautaDiurnos12 = allGuards12.filter(g => g.turno === "diurno");

    const allDiurnoEntries12 = pautaEntries12.filter(e => turnoFromShift(e.puesto.shiftStart) === "diurno");

    // Also check what pauta 11-mar says for diurnos (what grid actually uses)
    const pautaData11 = byInst11.get(inst.name);
    const pautaEntries11 = pautaData11?.entries ?? [];
    const allGuards11 = extractGuards(pautaEntries11);
    const pautaDiurnos11 = allGuards11.filter(g => g.turno === "diurno");

    const cnInst = cn?.instalaciones.find(i => i.installationId === inst.id);
    const gridDiurnos = cnInst?.guardias.filter(g => g.turno === "diurno") ?? [];

    if (pautaDiurnos12.length === 0 && gridDiurnos.length === 0 && allDiurnoEntries12.length === 0) continue;

    console.log(`\n  ┌─ ${inst.name}`);

    // Show pauta 12-mar diurnos (the CORRECT source for "turno de día de mañana")
    if (allDiurnoEntries12.length > 0) {
      console.log(`  │  PAUTA 12-mar (puestos diurnos - CORRECTO para mañana):`);
      for (const e of allDiurnoEntries12) {
        const g = e.replacementGuardia ?? e.plannedGuardia;
        const nombre = g ? fmtName(g.persona.firstName, g.persona.lastName) : "SIN GUARDIA";
        const repl = e.replacementGuardia ? " [REEMP]" : "";
        const working = isWorking(e.shiftCode) ? "✅" : "⬜";
        console.log(`  │    ${working} S${e.slotNumber} ${e.puesto.name} (${e.puesto.shiftStart}-${e.puesto.shiftEnd}) | code=${e.shiftCode ?? 'NULL'} | ${nombre}${repl}`);
      }
      console.log(`  │    → Guardias diurno 12-mar TRABAJANDO: ${pautaDiurnos12.length}`);
    }

    // Show what pauta 11-mar says for diurnos (what the grid ACTUALLY uses)
    if (pautaDiurnos11.length > 0) {
      console.log(`  │  PAUTA 11-mar diurno (lo que grid REALMENTE usa):`);
      for (const g of pautaDiurnos11) {
        console.log(`  │    ${g.nombre} (${g.puestoName}) [code=${g.shiftCode}]`);
      }
    }

    // Show grid
    if (cnInst && gridDiurnos.length > 0) {
      console.log(`  │  GRID diurnos:`);
      for (const g of gridDiurnos) {
        console.log(`  │    ${g.guardiaNombre} | status=${g.status}`);
      }
    } else if (cnInst) {
      console.log(`  │  GRID diurnos: (ninguno)`);
    }

    // Compare
    const correctCount = pautaDiurnos12.length;
    const gridUsesCount = pautaDiurnos11.length;
    const actualGrid = gridDiurnos.length;

    if (correctCount !== actualGrid) {
      console.log(`  │  ⚠️  Pauta 12-mar dice ${correctCount} diurnos, grid tiene ${actualGrid}`);
    }
    if (gridUsesCount !== correctCount) {
      console.log(`  │  ⚠️  Grid usa pauta 11-mar (${gridUsesCount} diurnos) vs correcto 12-mar (${correctCount} diurnos)`);
    }

    console.log(`  └─`);
  }

  // ══════════════════════════════════════════════════════════════
  // PASO 7: Verificar qué código usa resolveGuardsFromSources
  // ══════════════════════════════════════════════════════════════
  console.log("\n\n" + "═".repeat(100));
  console.log("  🔬 VERIFICACIÓN: ¿Qué query hace resolveGuardsFromSources?");
  console.log("  El código busca: shiftCode = 'T' (hardcoded en generate-grid.ts línea 83)");
  console.log("  Pero la pauta usa Td (trabajo diurno) y Tn (trabajo nocturno) para rotativos!");
  console.log("═".repeat(100));

  // Show installations where pauta uses Td/Tn instead of T
  for (const inst of installations) {
    const pautaData = byInst11.get(inst.name);
    if (!pautaData) continue;

    const tdTn = pautaData.entries.filter(e => e.shiftCode === "Td" || e.shiftCode === "Tn");
    const tOnly = pautaData.entries.filter(e => e.shiftCode === "T");

    if (tdTn.length > 0) {
      console.log(`\n  ❌ ${inst.name}: usa Td/Tn (${tdTn.length} entradas) + T (${tOnly.length} entradas)`);
      console.log(`     → resolveGuardsFromSources con shiftCode='T' IGNORA los Td/Tn!`);
      for (const e of tdTn) {
        const g = e.replacementGuardia ?? e.plannedGuardia;
        const nombre = g ? fmtName(g.persona.firstName, g.persona.lastName) : "SIN GUARDIA";
        console.log(`     ${e.shiftCode} S${e.slotNumber} ${e.puesto.name} (${e.puesto.shiftStart}-${e.puesto.shiftEnd}) | ${nombre}`);
      }
    }
  }

  // Also check installations NOT in nocturno list that have Td/Tn
  const allInstWithTdTn = await prisma.$queryRaw<Array<{installation_id: string, name: string, shift_code: string, cnt: bigint}>>`
    SELECT pm.installation_id, ci.name, pm.shift_code, COUNT(*) as cnt
    FROM ops.pauta_mensual pm
    JOIN crm.crm_installations ci ON ci.id = pm.installation_id
    WHERE pm.tenant_id = ${tenantId}
      AND pm.date = '2026-03-11'
      AND pm.shift_code IN ('Td', 'Tn')
    GROUP BY pm.installation_id, ci.name, pm.shift_code
    ORDER BY ci.name, pm.shift_code
  `;

  if (allInstWithTdTn.length > 0) {
    console.log("\n\n  📋 TODAS las instalaciones con Td/Tn en pauta 11-mar:");
    for (const row of allInstWithTdTn) {
      console.log(`     ${row.name}: ${row.shift_code} × ${row.cnt}`);
    }
  }

  console.log("\n\nDiagnóstico V2 completo.\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
