/**
 * Backfill: permisos Productividad en role templates (custom y de sistema).
 *
 * Correos y Agenda migraron del permiso prestado `crm.deals` al módulo propio
 * `productividad`. Los role templates guardan su JSON de permisos en BD; sin
 * este backfill, un rol que hoy ve Correos/Agenda (vía `crm.deals`) quedaría sin
 * `productividad.correos` / `productividad.agenda` explícito en la UI de Roles.
 *
 * Nota importante: el runtime ya aplica `applyProductividadCompat`
 * (src/lib/permissions.ts) como red de seguridad, así que NINGÚN usuario pierde
 * acceso aunque este script no se haya corrido todavía. Este backfill PERSISTE
 * los valores para que la UI de Roles y Permisos los muestre explícitos y para
 * poder retirar el shim más adelante.
 *
 * Idempotente: sólo escribe `productividad.correos` / `productividad.agenda`
 * cuando no existen ya como override explícito en el template.
 *
 * Ejecutar (una vez, post-deploy — NO corre automáticamente en el build):
 *   npx tsx scripts/backfill-productividad-permissions.ts            # aplica
 *   npx tsx scripts/backfill-productividad-permissions.ts --dry-run  # sólo reporta
 */

import { PrismaClient } from "@prisma/client";
import {
  getDefaultPermissions,
  mergeRolePermissions,
  getEffectiveLevel,
  LEVEL_RANK,
  normalizeRole,
  type RolePermissions,
  type PermissionLevel,
} from "../src/lib/permissions";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

const TARGET_SUBMODULES = [
  "productividad.correos",
  "productividad.agenda",
] as const;

async function main() {
  const templates = await prisma.roleTemplate.findMany({
    orderBy: [{ tenantId: "asc" }, { slug: "asc" }],
    select: { id: true, tenantId: true, slug: true, name: true, permissions: true },
  });

  console.log(
    `RoleTemplates encontrados: ${templates.length}${DRY_RUN ? "  (DRY RUN)" : ""}\n`,
  );

  let updated = 0;
  let skipped = 0;

  for (const t of templates) {
    const stored = (t.permissions ?? {}) as unknown as RolePermissions;
    const storedSubmodules = stored.submodules ?? {};

    // Nivel efectivo de crm.deals tal como lo ve el runtime: defaults del slug
    // + override persistido del template.
    const merged = mergeRolePermissions(getDefaultPermissions(normalizeRole(t.slug)), {
      modules: stored.modules ?? {},
      submodules: storedSubmodules,
      capabilities: stored.capabilities ?? {},
    });
    const dealsLevel: PermissionLevel = getEffectiveLevel(merged, "crm", "deals");

    // Sin acceso a Comercial (deals < view) → no había Correos/Agenda que
    // preservar. El shim/defaults cubren el piso de agenda/tareas operativo.
    if (LEVEL_RANK[dealsLevel] < LEVEL_RANK.view) {
      skipped++;
      continue;
    }

    const nextSubmodules: Record<string, PermissionLevel> = { ...storedSubmodules };
    let changed = false;
    for (const key of TARGET_SUBMODULES) {
      if (key in nextSubmodules) continue; // ya migrado → idempotente
      nextSubmodules[key] = dealsLevel;
      changed = true;
    }

    if (!changed) {
      skipped++;
      continue;
    }

    console.log(
      `  ${DRY_RUN ? "🔎" : "✅"} [${t.tenantId}] ${t.slug} (${t.name}): correos/agenda = ${dealsLevel}`,
    );

    if (!DRY_RUN) {
      const nextPermissions: RolePermissions = {
        modules: stored.modules ?? {},
        submodules: nextSubmodules,
        capabilities: stored.capabilities ?? {},
      };
      await prisma.roleTemplate.update({
        where: { id: t.id },
        data: { permissions: nextPermissions as object },
      });
    }
    updated++;
  }

  console.log(`\nResumen: ${updated} actualizados, ${skipped} sin cambios.`);
  if (DRY_RUN) console.log("DRY RUN: no se escribió nada en la base de datos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
