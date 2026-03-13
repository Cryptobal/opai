/**
 * Diagnóstico: Grid Operativo vs Pauta Diaria
 *
 * Compara lo que dice la pauta mensual para:
 *   - Turno Nocturno 11 de marzo 2026
 *   - Turno Día 12 de marzo 2026
 * con lo que tiene el Control Nocturno (grid operativo) actual.
 *
 * Ejecutar: npx tsx scripts/diagnose-grid-vs-pauta.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Determine turno from shift hours (same logic as generate-grid.ts)
function turnoFromShift(shiftStart: string): "nocturno" | "diurno" {
  const hour = parseInt(shiftStart.split(":")[0], 10);
  return hour >= 18 || hour < 4 ? "nocturno" : "diurno";
}

async function main() {
  // ══════════════════════════════════════════════════════════════════
  // 1. Find the tenant (assuming single tenant for simplicity)
  // ══════════════════════════════════════════════════════════════════
  const tenants = await prisma.opsControlNocturno.findMany({
    select: { tenantId: true },
    distinct: ["tenantId"],
  });

  if (tenants.length === 0) {
    console.log("No hay ControlNocturno en la base de datos.");
    return;
  }

  const tenantId = tenants[0].tenantId;
  console.log(`\n🏢 Tenant: ${tenantId}\n`);

  // ══════════════════════════════════════════════════════════════════
  // 2. Fechas relevantes
  // ══════════════════════════════════════════════════════════════════
  // CN para nocturno del 11 de marzo = date = 2026-03-11
  // Pauta para nocturno 11 de marzo: shiftCode=T en date 2026-03-11 con puestos nocturnos
  // Pauta para día 12 de marzo: shiftCode=T en date 2026-03-12 con puestos diurnos

  const dateNocturno = new Date("2026-03-11T00:00:00.000Z");
  const dateDia = new Date("2026-03-12T00:00:00.000Z");

  console.log(`📅 Fecha nocturno: ${dateNocturno.toISOString().split('T')[0]}`);
  console.log(`📅 Fecha día:      ${dateDia.toISOString().split('T')[0]}`);

  // ══════════════════════════════════════════════════════════════════
  // 3. PAUTA: Qué dice para cada instalación (nocturno 11 y día 12)
  // ══════════════════════════════════════════════════════════════════

  // Get all installations with nocturno enabled
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId, isActive: true, nocturnoEnabled: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(`\n📋 Instalaciones con nocturno habilitado: ${installations.length}\n`);

  // ── Pauta Nocturno (11 marzo) ──
  console.log("═".repeat(120));
  console.log("  PAUTA MENSUAL — TURNO NOCTURNO — 11 MARZO 2026");
  console.log("═".repeat(120));

  const pautaNocturno11 = await prisma.opsPautaMensual.findMany({
    where: {
      tenantId,
      date: dateNocturno,
      shiftCode: "T",
    },
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
    orderBy: [{ installation: { name: "asc" } }, { puesto: { name: "asc" } }],
  });

  // Also get non-T entries to see rest days
  const pautaAll11 = await prisma.opsPautaMensual.findMany({
    where: {
      tenantId,
      date: dateNocturno,
    },
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
    orderBy: [{ installation: { name: "asc" } }, { puesto: { name: "asc" } }],
  });

  // Group by installation
  type PautaEntry = typeof pautaAll11[number];
  const pautaByInst11 = new Map<string, PautaEntry[]>();
  for (const p of pautaAll11) {
    const key = p.installation.name;
    if (!pautaByInst11.has(key)) pautaByInst11.set(key, []);
    pautaByInst11.get(key)!.push(p);
  }

  for (const [instName, entries] of [...pautaByInst11.entries()].sort()) {
    const nocturnos = entries.filter(e => turnoFromShift(e.puesto.shiftStart) === "nocturno");
    const diurnos = entries.filter(e => turnoFromShift(e.puesto.shiftStart) === "diurno");

    console.log(`\n  📍 ${instName}`);

    if (nocturnos.length > 0) {
      console.log(`     Puestos NOCTURNOS (shiftStart >= 18 || < 4):`);
      for (const e of nocturnos) {
        const guardia = e.replacementGuardia ?? e.plannedGuardia;
        const nombre = guardia
          ? `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim()
          : "SIN GUARDIA (PPC)";
        const reemplazo = e.replacementGuardia ? " [REEMPLAZO]" : "";
        console.log(`       Puesto: ${e.puesto.name} (${e.puesto.shiftStart}-${e.puesto.shiftEnd}) | Código: ${e.shiftCode} | Guardia: ${nombre}${reemplazo}`);
      }
      const trabNoc = nocturnos.filter(e => e.shiftCode === "T");
      console.log(`     → Guardias nocturno con T: ${trabNoc.length} (esto = guardiasRequeridos en grid)`);
    }

    if (diurnos.length > 0) {
      console.log(`     Puestos DIURNOS (shiftStart 4-17):`);
      for (const e of diurnos) {
        const guardia = e.replacementGuardia ?? e.plannedGuardia;
        const nombre = guardia
          ? `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim()
          : "SIN GUARDIA (PPC)";
        const reemplazo = e.replacementGuardia ? " [REEMPLAZO]" : "";
        console.log(`       Puesto: ${e.puesto.name} (${e.puesto.shiftStart}-${e.puesto.shiftEnd}) | Código: ${e.shiftCode} | Guardia: ${nombre}${reemplazo}`);
      }
    }
  }

  // ── Pauta Día (12 marzo) ──
  console.log("\n\n" + "═".repeat(120));
  console.log("  PAUTA MENSUAL — TURNO DIA — 12 MARZO 2026");
  console.log("═".repeat(120));

  const pautaAll12 = await prisma.opsPautaMensual.findMany({
    where: {
      tenantId,
      date: dateDia,
    },
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
    orderBy: [{ installation: { name: "asc" } }, { puesto: { name: "asc" } }],
  });

  const pautaByInst12 = new Map<string, PautaEntry[]>();
  for (const p of pautaAll12) {
    const key = p.installation.name;
    if (!pautaByInst12.has(key)) pautaByInst12.set(key, []);
    pautaByInst12.get(key)!.push(p);
  }

  for (const [instName, entries] of [...pautaByInst12.entries()].sort()) {
    const nocturnos = entries.filter(e => turnoFromShift(e.puesto.shiftStart) === "nocturno");
    const diurnos = entries.filter(e => turnoFromShift(e.puesto.shiftStart) === "diurno");

    console.log(`\n  📍 ${instName}`);

    if (diurnos.length > 0) {
      console.log(`     Puestos DIURNOS:`);
      for (const e of diurnos) {
        const guardia = e.replacementGuardia ?? e.plannedGuardia;
        const nombre = guardia
          ? `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim()
          : "SIN GUARDIA (PPC)";
        const reemplazo = e.replacementGuardia ? " [REEMPLAZO]" : "";
        console.log(`       Puesto: ${e.puesto.name} (${e.puesto.shiftStart}-${e.puesto.shiftEnd}) | Código: ${e.shiftCode} | Guardia: ${nombre}${reemplazo}`);
      }
    }

    if (nocturnos.length > 0) {
      console.log(`     Puestos NOCTURNOS:`);
      for (const e of nocturnos) {
        const guardia = e.replacementGuardia ?? e.plannedGuardia;
        const nombre = guardia
          ? `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim()
          : "SIN GUARDIA (PPC)";
        const reemplazo = e.replacementGuardia ? " [REEMPLAZO]" : "";
        console.log(`       Puesto: ${e.puesto.name} (${e.puesto.shiftStart}-${e.puesto.shiftEnd}) | Código: ${e.shiftCode} | Guardia: ${nombre}${reemplazo}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. GRID: Control Nocturno actual para 11 de marzo
  // ══════════════════════════════════════════════════════════════════
  console.log("\n\n" + "═".repeat(120));
  console.log("  CONTROL NOCTURNO (GRID OPERATIVO) — 11 MARZO 2026");
  console.log("═".repeat(120));

  const cn = await prisma.opsControlNocturno.findFirst({
    where: { tenantId, date: dateNocturno },
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

  if (!cn) {
    console.log("\n  ⚠️  No existe ControlNocturno para 2026-03-11");
    console.log("     El grid se crea cuando se inicia un turno de monitoreo.\n");
  } else {
    console.log(`\n  CN ID: ${cn.id}`);
    console.log(`  Status: ${cn.status}`);
    console.log(`  Shift: ${cn.shiftStart} - ${cn.shiftEnd}\n`);

    for (const inst of cn.instalaciones) {
      const nocturnos = inst.guardias.filter(g => g.turno === "nocturno");
      const diurnos = inst.guardias.filter(g => g.turno === "diurno");

      console.log(`  📍 ${inst.installationName}`);
      console.log(`     guardiasRequeridos: ${inst.guardiasRequeridos} | guardiasPresentes: ${inst.guardiasPresentes} | cobertura: ${inst.coberturaStatus}`);

      if (nocturnos.length > 0) {
        console.log(`     Guardias NOCTURNO en grid:`);
        for (const g of nocturnos) {
          console.log(`       ${g.guardiaNombre} | status: ${g.status} | llegada: ${g.horaLlegada || '-'} | extra: ${g.isExtra} | guardiaId: ${g.guardiaId || 'null'}`);
        }
      } else {
        console.log(`     Guardias NOCTURNO en grid: (ninguno)`);
      }

      if (diurnos.length > 0) {
        console.log(`     Guardias DIURNO en grid:`);
        for (const g of diurnos) {
          console.log(`       ${g.guardiaNombre} | status: ${g.status} | llegada: ${g.horaLlegada || '-'} | extra: ${g.isExtra} | guardiaId: ${g.guardiaId || 'null'}`);
        }
      }
      console.log();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 5. COMPARACIÓN: Pauta vs Grid
  // ══════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(120));
  console.log("  🔍 COMPARACIÓN: PAUTA vs GRID — DISCREPANCIAS");
  console.log("═".repeat(120));

  if (!cn) {
    console.log("\n  No hay CN para comparar. Revisa si se creó el turno de monitoreo.\n");
  } else {
    let discrepancias = 0;

    for (const inst of cn.instalaciones) {
      const instName = inst.installationName;
      const instId = inst.installationId;

      // What pauta says for this installation (nocturno March 11)
      const pautaEntries = instId
        ? pautaNocturno11.filter(p => p.installationId === instId)
        : [];

      // Filter to nocturno puestos only
      const pautaNoc = pautaEntries.filter(p => turnoFromShift(p.puesto.shiftStart) === "nocturno");
      const pautaDiu = pautaEntries.filter(p => turnoFromShift(p.puesto.shiftStart) === "diurno");

      // What grid says
      const gridNoc = inst.guardias.filter(g => g.turno === "nocturno");
      const gridDiu = inst.guardias.filter(g => g.turno === "diurno");

      // Also get pauta diurno for March 12 for this installation
      const pautaDia12 = instId
        ? pautaAll12.filter(p => p.installationId === instId && p.shiftCode === "T" && turnoFromShift(p.puesto.shiftStart) === "diurno")
        : [];

      const issues: string[] = [];

      // Check guardiasRequeridos
      if (inst.guardiasRequeridos !== pautaNoc.length) {
        issues.push(
          `guardiasRequeridos = ${inst.guardiasRequeridos} en grid, pero pauta tiene ${pautaNoc.length} guardias nocturno con T`
        );
      }

      // Check guard names match
      const pautaNocNames = new Set(
        pautaNoc.map(p => {
          const g = p.replacementGuardia ?? p.plannedGuardia;
          return g ? `${g.persona.firstName} ${g.persona.lastName}`.trim() : "PPC";
        })
      );
      const gridNocNames = new Set(gridNoc.map(g => g.guardiaNombre));

      // Guards in pauta but not in grid
      for (const name of pautaNocNames) {
        if (!gridNocNames.has(name)) {
          issues.push(`Guardia nocturno "${name}" está en PAUTA pero NO en GRID`);
        }
      }

      // Guards in grid but not in pauta
      for (const name of gridNocNames) {
        if (!pautaNocNames.has(name) && name !== "PPC") {
          issues.push(`Guardia nocturno "${name}" está en GRID pero NO en PAUTA`);
        }
      }

      // Check diurno guardias (grid uses pauta nocturno date for nocturnos, dia date for diurnos)
      // The grid populates diurno from the SAME CN date (March 11) but the puestos diurnos
      // actually correspond to the NEXT morning (March 12)
      // Let's check what the grid has vs what pauta dia 12 says
      const pautaDia12Names = new Set(
        pautaDia12.map(p => {
          const g = p.replacementGuardia ?? p.plannedGuardia;
          return g ? `${g.persona.firstName} ${g.persona.lastName}`.trim() : "PPC";
        })
      );

      // But the grid populates diurnos from the CN date (March 11) not March 12!
      // This could be a source of discrepancy
      const pautaDiuFromCNDate = instId
        ? pautaAll11.filter(p => p.installationId === instId && p.shiftCode === "T" && turnoFromShift(p.puesto.shiftStart) === "diurno")
        : [];
      const pautaDiuCNDateNames = new Set(
        pautaDiuFromCNDate.map(p => {
          const g = p.replacementGuardia ?? p.plannedGuardia;
          return g ? `${g.persona.firstName} ${g.persona.lastName}`.trim() : "PPC";
        })
      );

      if (pautaDia12Names.size > 0 && gridDiu.length > 0) {
        for (const name of pautaDia12Names) {
          if (!new Set(gridDiu.map(g => g.guardiaNombre)).has(name)) {
            issues.push(`Guardia DIURNO "${name}" está en PAUTA 12-marzo pero NO en GRID`);
          }
        }
      }

      // The grid resolveGuardsFromSources uses cnDate (March 11), so diurno guards
      // come from March 11 pauta, not March 12. This is potentially THE BUG.
      if (pautaDiuCNDateNames.size !== pautaDia12Names.size && (pautaDia12Names.size > 0 || pautaDiuCNDateNames.size > 0)) {
        issues.push(
          `⚠️ POSIBLE BUG: Grid usa fecha CN (11-mar) para diurnos → obtiene ${pautaDiuCNDateNames.size} guardias diurno, ` +
          `pero pauta del 12-mar tiene ${pautaDia12Names.size} guardias diurno`
        );
      }

      if (issues.length > 0) {
        discrepancias++;
        console.log(`\n  ❌ ${instName}`);
        for (const issue of issues) {
          console.log(`     • ${issue}`);
        }
      }
    }

    // Installations in pauta but not in grid
    const gridInstIds = new Set(cn.instalaciones.map(i => i.installationId).filter(Boolean));
    const pautaInstIds = new Set(pautaNocturno11.map(p => p.installationId));

    for (const instId of pautaInstIds) {
      if (!gridInstIds.has(instId)) {
        const instName = pautaNocturno11.find(p => p.installationId === instId)?.installation.name;
        console.log(`\n  ❌ ${instName || instId}`);
        console.log(`     • Instalación tiene guardias en PAUTA nocturno pero NO aparece en GRID`);
        discrepancias++;
      }
    }

    if (discrepancias === 0) {
      console.log("\n  ✅ No se encontraron discrepancias entre pauta y grid");
    } else {
      console.log(`\n\n  📊 Total discrepancias: ${discrepancias} instalaciones con problemas`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. Check: what resolveGuardsFromSources would return for each
  // ══════════════════════════════════════════════════════════════════
  console.log("\n\n" + "═".repeat(120));
  console.log("  🔬 SIMULACIÓN: resolveGuardsFromSources para cada instalación (fecha CN = 11-mar)");
  console.log("═".repeat(120));

  for (const inst of installations) {
    const pautas = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId,
        installationId: inst.id,
        date: dateNocturno,
        shiftCode: "T",
      },
      include: {
        plannedGuardia: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
        replacementGuardia: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
        puesto: { select: { shiftStart: true } },
      },
    });

    const guards: { name: string; turno: string }[] = [];
    const seen = new Set<string>();

    for (const pauta of pautas) {
      const effective = pauta.replacementGuardia ?? pauta.plannedGuardia;
      const turno = pauta.puesto?.shiftStart ? turnoFromShift(pauta.puesto.shiftStart) : "nocturno";

      if (!effective) {
        guards.push({ name: "PPC", turno });
        continue;
      }

      const name = `${effective.persona.firstName} ${effective.persona.lastName}`.trim();
      const key = `${effective.id}-${turno}`;
      if (seen.has(key)) continue;
      seen.add(key);
      guards.push({ name, turno });
    }

    const nocCount = guards.filter(g => g.turno === "nocturno").length;
    const diuCount = guards.filter(g => g.turno === "diurno").length;

    // Check if pauta has ANY entries (even non-T)
    let source = "pauta (T entries)";
    if (pautas.length === 0) {
      const anyPauta = await prisma.opsPautaMensual.count({
        where: { tenantId, installationId: inst.id, date: dateNocturno },
      });
      if (anyPauta > 0) {
        source = "pauta (todos descanso/vacaciones - 0 guardias)";
      } else {
        source = "fallback (asignaciones o CN anterior)";
        // Check asignaciones
        const asigs = await prisma.opsAsignacionGuardia.findMany({
          where: { tenantId, installationId: inst.id, isActive: true },
          include: {
            guardia: { include: { persona: { select: { firstName: true, lastName: true } } } },
            puesto: { select: { shiftStart: true } },
          },
        });
        if (asigs.length > 0) {
          source = `fallback ASIGNACIONES (${asigs.length} activas)`;
          for (const a of asigs) {
            const turno = a.puesto?.shiftStart ? turnoFromShift(a.puesto.shiftStart) : "nocturno";
            const name = `${a.guardia.persona.firstName} ${a.guardia.persona.lastName}`.trim();
            guards.push({ name, turno });
          }
        }
      }
    }

    if (guards.length > 0 || source.includes("fallback")) {
      console.log(`\n  📍 ${inst.name} [source: ${source}]`);
      console.log(`     → nocturnoRequired (guardiasRequeridos): ${nocCount}`);
      if (guards.length > 0) {
        for (const g of guards) {
          console.log(`       ${g.turno === "nocturno" ? "🌙" : "☀️"} ${g.name} (${g.turno})`);
        }
      }
    }
  }

  console.log("\n\nDiagnóstico completo.\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
