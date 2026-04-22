/**
 * Lectura de diagnóstico: estado de un admin + sus permisos efectivos.
 * Uso:
 *   npx tsx scripts/audit-admin-permissions.ts <email>
 *   npx tsx scripts/audit-admin-permissions.ts carlos.irigoyen@gard.cl
 *
 * Sólo lectura. No modifica BD.
 */

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_ROLE_PERMISSIONS,
  MODULE_KEYS,
  CAPABILITY_KEYS,
  getEffectiveLevel,
  hasCapability,
  mergeRolePermissions,
  normalizeRole,
  type RolePermissions,
} from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Uso: npx tsx scripts/audit-admin-permissions.ts <email>");
    process.exit(1);
  }

  const admin = await prisma.admin.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      roleTemplateId: true,
      status: true,
      tenantId: true,
      lastLoginAt: true,
      createdAt: true,
      roleTemplate: {
        select: { id: true, name: true, slug: true, isSystem: true, permissions: true },
      },
      tenant: { select: { id: true, slug: true, name: true } },
    },
  });

  if (!admin) {
    console.log(`❌ No existe Admin con email ${email}`);
    process.exit(2);
  }

  console.log("=== ADMIN ===");
  console.log({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    normalizedRole: normalizeRole(admin.role),
    roleTemplateId: admin.roleTemplateId,
    status: admin.status,
    tenant: admin.tenant,
    lastLoginAt: admin.lastLoginAt,
  });

  if (admin.roleTemplate) {
    console.log("\n=== ROLE TEMPLATE ASIGNADO ===");
    console.log({
      id: admin.roleTemplate.id,
      name: admin.roleTemplate.name,
      slug: admin.roleTemplate.slug,
      isSystem: admin.roleTemplate.isSystem,
    });
  } else {
    console.log("\n(sin roleTemplateId — usa defaults por rol legacy)");
  }

  // Resolver permisos efectivos (mismo algoritmo que resolvePermissions)
  const normalized = normalizeRole(admin.role);
  const defaults = DEFAULT_ROLE_PERMISSIONS[normalized] ?? { modules: {}, submodules: {}, capabilities: {} };
  let effective: RolePermissions = defaults;
  if (admin.roleTemplate?.permissions && normalized !== "owner") {
    effective = mergeRolePermissions(
      defaults,
      admin.roleTemplate.permissions as unknown as RolePermissions,
    );
  }

  console.log("\n=== MODULE LEVELS ===");
  for (const m of MODULE_KEYS) {
    const lvl = getEffectiveLevel(effective, m);
    console.log(`  ${m.padEnd(15)} ${lvl}`);
  }

  console.log("\n=== CAPABILITIES (true) ===");
  const caps = CAPABILITY_KEYS.filter((c) => hasCapability(effective, c));
  console.log(caps.length === 0 ? "  (ninguna)" : caps.map((c) => `  ${c}`).join("\n"));

  console.log("\n=== DIAGNÓSTICO ===");
  const isOwner = normalized === "owner";
  const isActive = admin.status === "active";
  const hasAllModulesFull =
    MODULE_KEYS.every((m) => getEffectiveLevel(effective, m) === "full");
  const hasAllCaps = CAPABILITY_KEYS.every((c) => hasCapability(effective, c));

  console.log({
    esOwner: isOwner,
    estaActivo: isActive,
    todosLosModulosFull: hasAllModulesFull,
    todasLasCapabilities: hasAllCaps,
    tieneRoleTemplateCustom: admin.roleTemplateId !== null,
    OK: isOwner && isActive && hasAllModulesFull && hasAllCaps,
  });

  if (!isOwner) console.log(`⚠ role actual "${admin.role}" (normalizado "${normalized}") — debería ser "owner"`);
  if (!isActive) console.log(`⚠ status "${admin.status}" — debería ser "active"`);
  if (admin.roleTemplateId) {
    console.log(`ℹ Tiene roleTemplateId asignado. Para owner, el sistema ignora el template y da full — pero por higiene conviene dejarlo en null.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
