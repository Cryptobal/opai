/**
 * Backfill: capability `copiloto_correos` en RoleTemplates (custom y sistema).
 *
 * El Copiloto dejó de gatearse con `radar_comercial`. Los templates en BD
 * guardan un JSON de permisos; sin este backfill, un rol que tenía
 * `radar_comercial: true` puede quedar sin `copiloto_correos` explícito
 * (el runtime ya aplica `applyCopilotoCorreosCompat` como red de seguridad).
 *
 * Este script:
 * 1. Otorga `copiloto_correos: true` si el template tenía `radar_comercial: true`
 *    y aún no define `copiloto_correos`.
 * 2. Elimina del JSON las caps legacy `radar_*` (ya fuera del catálogo).
 *
 * Idempotente. NO toca schema ni tablas de negocio.
 *
 * Ejecutar (una vez, post-deploy — NO corre automáticamente en el build):
 *   npx tsx scripts/backfill-copiloto-correos-permissions.ts            # aplica
 *   npx tsx scripts/backfill-copiloto-correos-permissions.ts --dry-run  # sólo reporta
 */

import { PrismaClient } from "@prisma/client";
import {
  LEGACY_RADAR_CAPABILITY_KEYS,
  type RolePermissions,
} from "../src/lib/permissions";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

const LEGACY = new Set<string>(LEGACY_RADAR_CAPABILITY_KEYS);

function migrateCapabilities(
  caps: RolePermissions["capabilities"] | Record<string, unknown> | undefined,
): { next: RolePermissions["capabilities"]; changed: boolean; granted: boolean; stripped: string[] } {
  const raw = { ...(caps ?? {}) } as Record<string, unknown>;
  const stripped: string[] = [];
  let granted = false;
  let changed = false;

  const hadRadarComercial = raw.radar_comercial === true;
  const hasCopiloto = raw.copiloto_correos === true;
  const copilotoExplicitFalse = raw.copiloto_correos === false;

  if (hadRadarComercial && !hasCopiloto && !copilotoExplicitFalse) {
    raw.copiloto_correos = true;
    granted = true;
    changed = true;
  }

  for (const key of LEGACY) {
    if (key in raw) {
      delete raw[key];
      stripped.push(key);
      changed = true;
    }
  }

  return {
    next: raw as RolePermissions["capabilities"],
    changed,
    granted,
    stripped,
  };
}

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
  let grantedCount = 0;

  for (const t of templates) {
    const stored = (t.permissions ?? {}) as unknown as RolePermissions;
    const { next, changed, granted, stripped } = migrateCapabilities(stored.capabilities);

    if (!changed) {
      skipped++;
      continue;
    }

    if (granted) grantedCount++;
    console.log(
      `  ${DRY_RUN ? "🔎" : "✅"} [${t.tenantId}] ${t.slug} (${t.name}):` +
        `${granted ? " +copiloto_correos" : ""}` +
        `${stripped.length ? ` -${stripped.join(",")}` : ""}`,
    );

    if (!DRY_RUN) {
      const nextPermissions: RolePermissions = {
        modules: stored.modules ?? {},
        submodules: stored.submodules ?? {},
        capabilities: next,
      };
      await prisma.roleTemplate.update({
        where: { id: t.id },
        data: { permissions: nextPermissions as object },
      });
    }
    updated++;
  }

  console.log(
    `\nResumen: ${updated} actualizados (${grantedCount} con copiloto otorgado), ${skipped} sin cambios.`,
  );
  if (DRY_RUN) console.log("DRY RUN: no se escribió nada en la base de datos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
