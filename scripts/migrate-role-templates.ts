/**
 * Migración: Actualizar RoleTemplates y asignar a usuarios activos
 *
 * PASO 1: Verificar estado actual
 * PASO 2: Actualizar permissions JSON de templates existentes
 * PASO 3: Crear template jefatura (jefe_operaciones) y asignar a Rafael
 * PASO 4: NO cambiar slugs de rol (se mantienen admin, editor, jefe_operaciones)
 * PASO 5: Dejar templates sin usuarios como están (Opción A)
 * PASO 6: Verificación final
 *
 * Ejecutar: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-role-templates.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_ROLE_PERMISSIONS,
  type RolePermissions,
} from "../src/lib/permissions";

const prisma = new PrismaClient();

async function getTenantId(): Promise<string> {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  if (!tenant) throw new Error("Tenant 'gard' no encontrado");
  return tenant.id;
}

// Mapeo slug BD → permisos en código
const TEMPLATE_PERMISSION_MAP: Record<string, RolePermissions> = {
  owner: DEFAULT_ROLE_PERMISSIONS.owner,
  admin: DEFAULT_ROLE_PERMISSIONS.admin,
  editor: DEFAULT_ROLE_PERMISSIONS.editor,
  supervisor: DEFAULT_ROLE_PERMISSIONS.supervisor,
  central_monitoreo: DEFAULT_ROLE_PERMISSIONS.central_monitoreo,
  viewer: DEFAULT_ROLE_PERMISSIONS.viewer,
  jefe_operaciones: DEFAULT_ROLE_PERMISSIONS.jefe_operaciones,
};

async function main() {
  const TENANT_ID = await getTenantId();
  console.log(`Tenant gard: ${TENANT_ID}\n`);

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("PASO 1: Estado actual de usuarios activos");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const admins = await prisma.admin.findMany({
    where: { status: "active", tenantId: TENANT_ID },
    include: { roleTemplate: true },
    orderBy: { role: "asc" },
  });

  console.log(
    "| email | role | roleTemplateId | template_slug | template_name |"
  );
  console.log(
    "|-------|------|----------------|---------------|---------------|"
  );
  for (const a of admins) {
    console.log(
      `| ${a.email} | ${a.role} | ${a.roleTemplateId ?? "NULL"} | ${a.roleTemplate?.slug ?? "-"} | ${a.roleTemplate?.name ?? "-"} |`
    );
  }
  console.log(`\nTotal: ${admins.length} usuarios activos\n`);

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("PASO 2: RoleTemplates existentes");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const templates = await prisma.roleTemplate.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { slug: "asc" },
  });

  for (const t of templates) {
    console.log(`- ${t.slug} (${t.name})`);
  }
  console.log("");

  // PASO 2: Actualizar permissions de templates que existen en nuestro mapa
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("PASO 2: Actualizando permissions de RoleTemplates");
  console.log("═══════════════════════════════════════════════════════════════\n");

  for (const t of templates) {
    const perms = TEMPLATE_PERMISSION_MAP[t.slug];
    if (!perms) {
      console.log(`  ⏭️  ${t.slug}: sin mapeo en código, se omite`);
      continue;
    }
    await prisma.roleTemplate.update({
      where: { id: t.id },
      data: { permissions: perms as object },
    });
    console.log(`  ✅ ${t.slug}: permissions actualizados`);
  }

  // PASO 3: Crear template jefe_operaciones si no existe y asignar a Rafael
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("PASO 3: Template jefe_operaciones (Jefatura)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let jefaturaTemplate = await prisma.roleTemplate.findFirst({
    where: { tenantId: TENANT_ID, slug: "jefe_operaciones" },
  });

  if (!jefaturaTemplate) {
    jefaturaTemplate = await prisma.roleTemplate.create({
      data: {
        tenantId: TENANT_ID,
        slug: "jefe_operaciones",
        name: "Jefatura",
        description:
          "Gestión operativa completa, supervisión, rendiciones. CRM y finanzas solo lectura.",
        isSystem: false,
        permissions: DEFAULT_ROLE_PERMISSIONS.jefe_operaciones as object,
      },
    });
    console.log("  ✅ Template jefe_operaciones (Jefatura) creado");
  } else {
    await prisma.roleTemplate.update({
      where: { id: jefaturaTemplate.id },
      data: {
        permissions: DEFAULT_ROLE_PERMISSIONS.jefe_operaciones as object,
      },
    });
    console.log("  ✅ Template jefe_operaciones ya existía, permissions actualizados");
  }

  // Asignar a usuarios con role=jefe_operaciones que no tienen roleTemplateId
  const rafaelOrJefes = await prisma.admin.findMany({
    where: {
      tenantId: TENANT_ID,
      status: "active",
      role: "jefe_operaciones",
      roleTemplateId: null,
    },
  });

  for (const u of rafaelOrJefes) {
    await prisma.admin.update({
      where: { id: u.id },
      data: { roleTemplateId: jefaturaTemplate!.id },
    });
    console.log(`  ✅ Asignado template a ${u.email} (${u.name})`);
  }

  if (rafaelOrJefes.length === 0) {
    console.log("  ℹ️  No hay usuarios jefe_operaciones sin template asignado");
  }

  // PASO 5: Resumen de templates y usuarios
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("PASO 5: Templates y conteo de usuarios");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const templateCounts = await prisma.roleTemplate.findMany({
    where: { tenantId: TENANT_ID },
    include: {
      admins: {
        select: { id: true, status: true },
      },
    },
    orderBy: { slug: "asc" },
  });

  for (const rt of templateCounts) {
    const total = rt.admins.length;
    const active = rt.admins.filter((a) => a.status === "active").length;
    console.log(`  ${rt.slug}: ${total} usuarios total, ${active} activos`);
  }

  // PASO 6: Verificación final
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("PASO 6: Verificación final");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const finalAdmins = await prisma.admin.findMany({
    where: { status: "active", tenantId: TENANT_ID },
    include: { roleTemplate: true },
    orderBy: { role: "asc" },
  });

  const sinTemplate = finalAdmins.filter((a) => !a.roleTemplateId);
  if (sinTemplate.length > 0) {
    console.log("  ⚠️  Usuarios SIN roleTemplateId:");
    for (const u of sinTemplate) {
      console.log(`     - ${u.email} (role: ${u.role})`);
    }
  } else {
    console.log("  ✅ Todos los usuarios activos tienen roleTemplateId asignado");
  }

  console.log("\n  Estado final:");
  console.log(
    "  | email | role | template_slug |"
  );
  console.log(
    "  |-------|------|---------------|"
  );
  for (const a of finalAdmins) {
    console.log(
      `  | ${a.email} | ${a.role} | ${a.roleTemplate?.slug ?? "NULL"} |`
    );
  }

  console.log("\n✅ Migración completada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
