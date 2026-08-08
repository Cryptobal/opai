/**
 * Simulación de enforcement de módulos por plan (solo lectura).
 *
 * Uso:
 *   npx tsx scripts/simulate-module-enforcement.ts
 *   npx tsx scripts/simulate-module-enforcement.ts --tenant gard
 *
 * Procedimiento de flip a producción (TENANT_MODULE_ENFORCEMENT=on):
 * 1. Ejecutar esta simulación contra la BD objetivo y revisar tenants con
 *    prefijos bloqueados en rutas que usan en operación diaria.
 * 2. Desplegar el código con TENANT_MODULE_ENFORCEMENT=log (nunca on).
 * 3. Revisar logs de producción `[MODULE_GATE]` durante al menos 7 días.
 * 4. Confirmar que ningún tenant activo aparece bloqueado en rutas que usa.
 * 5. Cambiar TENANT_MODULE_ENFORCEMENT=on en Vercel.
 * 6. Observar 24 h; ante cualquier incidencia, revertir a `log` (efecto
 *    inmediato, sin redespliegue).
 *
 * Este script NO escribe nada en la base de datos.
 */

import { PrismaClient } from "@prisma/client";
import { ALL_MODULES } from "../src/lib/tenant-modules";
import { MODULE_ROUTE_PREFIXES } from "../src/lib/tenant-module-routes";

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { tenantSlug?: string } {
  const out: { tenantSlug?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--tenant" && argv[i + 1]) {
      out.tenantSlug = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

async function resolveEnabledModules(tenantId: string): Promise<{
  mode: "all" | "partial" | "empty";
  modules: Set<string>;
}> {
  const rows = await prisma.tenantModule.findMany({
    where: { tenantId },
    select: { module: true, enabled: true },
  });
  if (rows.length === 0) {
    return { mode: "all", modules: new Set(ALL_MODULES) };
  }
  const enabled = new Set(rows.filter((r) => r.enabled).map((r) => r.module));
  return {
    mode: enabled.size === 0 ? "empty" : "partial",
    modules: enabled,
  };
}

function uniquePrefixesByModule(): Array<{ module: string; prefixes: string[] }> {
  const byModule = new Map<string, string[]>();
  for (const entry of MODULE_ROUTE_PREFIXES) {
    const list = byModule.get(entry.module) ?? [];
    list.push(entry.prefix);
    byModule.set(entry.module, list);
  }
  return [...byModule.entries()]
    .map(([module, prefixes]) => ({ module, prefixes: prefixes.sort() }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

async function main() {
  const { tenantSlug } = parseArgs(process.argv.slice(2));
  const tenants = await prisma.tenant.findMany({
    where: tenantSlug ? { slug: tenantSlug } : { active: true },
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });

  if (tenants.length === 0) {
    console.log(tenantSlug
      ? `No se encontró tenant con slug "${tenantSlug}".`
      : "No hay tenants activos.");
    return;
  }

  const modulePrefixes = uniquePrefixesByModule();
  console.log("=== Simulación TENANT_MODULE_ENFORCEMENT=on (solo lectura) ===\n");
  console.log(`Tenants: ${tenants.length}`);
  console.log(`Módulos con prefijos en mapa: ${modulePrefixes.length}\n`);

  for (const tenant of tenants) {
    const resolved = await resolveEnabledModules(tenant.id);
    const blocked = modulePrefixes.filter((m) => !resolved.modules.has(m.module));

    console.log("─".repeat(72));
    console.log(`Tenant: ${tenant.slug} (${tenant.name})`);
    console.log(`  id: ${tenant.id}`);
    console.log(
      `  módulos: ${
        resolved.mode === "all"
          ? "ALL_MODULES (legado / sin filas TenantModule → sentinel *)"
          : resolved.mode === "empty"
            ? "ninguno habilitado (filas presentes, todas disabled)"
            : `${resolved.modules.size} habilitados`
      }`,
    );

    if (blocked.length === 0) {
      console.log("  bloqueados al activar on: (ninguno)");
      continue;
    }

    console.log("  bloqueados al activar on:");
    console.log(
      [
        "    " + "módulo".padEnd(22),
        "prefijos",
      ].join("  "),
    );
    for (const row of blocked) {
      console.log(
        [
          "    " + row.module.padEnd(22),
          row.prefixes.join(", "),
        ].join("  "),
      );
    }
  }

  console.log("\n" + "─".repeat(72));
  console.log("Fin de simulación. No se escribió nada.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
