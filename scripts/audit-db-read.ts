// AUDIT SCRIPT — READ ONLY
// Si este archivo contiene cualquier UPDATE/INSERT/DELETE, ABORTAR.
import { prisma } from "../src/lib/prisma";
import { SUBMODULE_KEYS, MODULE_KEYS, type ModuleKey, type RolePermissions, getEffectiveLevel } from "../src/lib/permissions";

async function main() {
  const report: string[] = [];

  // ═══════════════════════════════════════════════════════════════
  //  BLOQUE 2 — Inventario de RoleTemplates
  // ═══════════════════════════════════════════════════════════════
  report.push("## 2. Role Templates en Base de Datos\n");

  try {
    const templates = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        slug: string;
        name: string;
        isSystem: boolean;
        tenantId: string | null;
        permissions_pretty: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(
      `SELECT id, slug, name, "isSystem", "tenantId",
              jsonb_pretty(permissions::jsonb) as permissions_pretty,
              "createdAt", "updatedAt"
       FROM "RoleTemplate"
       ORDER BY "isSystem" DESC, slug ASC;`,
    );

    report.push(`Total templates: **${templates.length}**\n`);
    report.push(
      "| slug | name | isSystem | tenantId | modulos | submódulos overrides | capabilities activas | submódulos inválidos |",
    );
    report.push("|---|---|---|---|---|---|---|---|");

    for (const t of templates) {
      let perms: RolePermissions;
      try {
        perms = JSON.parse(t.permissions_pretty) as RolePermissions;
      } catch {
        report.push(`| ${t.slug} | ${t.name} | ${t.isSystem} | ${t.tenantId ?? "—"} | — | — | — | PARSE_ERROR |`);
        continue;
      }

      const moduleCount = Object.keys(perms.modules ?? {}).length;
      const submoduleCount = Object.keys(perms.submodules ?? {}).length;
      const capabilityCount = Object.entries(perms.capabilities ?? {}).filter(([, v]) => v === true).length;

      const invalidSubs: string[] = [];
      for (const key of Object.keys(perms.submodules ?? {})) {
        const [mod, sub] = key.split(".");
        if (!MODULE_KEYS.includes(mod as ModuleKey)) {
          invalidSubs.push(`${key} (módulo inválido)`);
          continue;
        }
        const validSubs = SUBMODULE_KEYS[mod as ModuleKey] as readonly string[];
        if (!validSubs.includes(sub)) {
          invalidSubs.push(`${key} (sub inválido)`);
        }
      }

      report.push(
        `| ${t.slug} | ${t.name} | ${t.isSystem} | ${t.tenantId ?? "—"} | ${moduleCount} | ${submoduleCount} | ${capabilityCount} | ${invalidSubs.length > 0 ? invalidSubs.join(", ") : "—"} |`,
      );
    }

    report.push("");

    // Dump full permissions JSON for each template (for later diff vs code)
    report.push("### 2.1 Permisos completos por template\n");
    for (const t of templates) {
      report.push(`\n<details><summary><strong>${t.slug}</strong> (${t.name})</summary>\n\n\`\`\`json\n${t.permissions_pretty}\n\`\`\`\n</details>`);
    }
    report.push("");
  } catch (e) {
    report.push(`**BLOQUE 2 FALLÓ**: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // ═══════════════════════════════════════════════════════════════
  //  BLOQUE 3 — Inventario de Admins/Users
  // ═══════════════════════════════════════════════════════════════
  report.push("\n## 3. Distribución de roles por tenant\n");

  try {
    const byRole = await prisma.$queryRawUnsafe<
      Array<{
        role: string;
        total: bigint;
        con_template: bigint;
        sin_template: bigint;
        tenants: string[];
      }>
    >(
      `SELECT
         a.role,
         COUNT(*) as total,
         COUNT(CASE WHEN a."roleTemplateId" IS NOT NULL THEN 1 END) as con_template,
         COUNT(CASE WHEN a."roleTemplateId" IS NULL THEN 1 END) as sin_template,
         array_agg(DISTINCT a."tenantId") as tenants
       FROM "Admin" a
       GROUP BY a.role
       ORDER BY total DESC;`,
    );

    report.push("### 3.1 Totales por rol\n");
    report.push("| rol | total | con template | sin template | tenants únicos |");
    report.push("|---|---:|---:|---:|---:|");
    for (const r of byRole) {
      report.push(
        `| ${r.role} | ${r.total} | ${r.con_template} | ${r.sin_template} | ${r.tenants?.length ?? 0} |`,
      );
    }
    report.push("");

    const byTenantRole = await prisma.$queryRawUnsafe<
      Array<{
        tenantId: string | null;
        tenant_slug: string | null;
        role: string;
        template_slug: string | null;
        usuarios: bigint;
      }>
    >(
      `SELECT
         a."tenantId",
         t.slug as tenant_slug,
         a.role,
         rt.slug as template_slug,
         COUNT(*) as usuarios
       FROM "Admin" a
       LEFT JOIN "Tenant" t ON t.id = a."tenantId"
       LEFT JOIN "RoleTemplate" rt ON rt.id = a."roleTemplateId"
       GROUP BY a."tenantId", t.slug, a.role, rt.slug
       ORDER BY t.slug, a.role;`,
    );

    report.push("### 3.2 Distribución tenant × rol × template\n");
    report.push("| tenant | rol | template asignado | usuarios |");
    report.push("|---|---|---|---:|");
    for (const r of byTenantRole) {
      report.push(
        `| ${r.tenant_slug ?? r.tenantId ?? "—"} | ${r.role} | ${r.template_slug ?? "(sin template)"} | ${r.usuarios} |`,
      );
    }
    report.push("");
  } catch (e) {
    report.push(`**BLOQUE 3 FALLÓ**: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // ═══════════════════════════════════════════════════════════════
  //  BLOQUE 6b — Matrix desde BD (templates reales)
  // ═══════════════════════════════════════════════════════════════
  report.push("\n## 6b. Matriz submódulo × RoleTemplate (datos REALES de BD)\n");

  try {
    const templates = await prisma.$queryRawUnsafe<
      Array<{ slug: string; permissions: unknown }>
    >(
      `SELECT slug, permissions::text as permissions FROM "RoleTemplate" ORDER BY slug ASC;`,
    );

    const parsed: Array<{ slug: string; perms: RolePermissions }> = [];
    for (const t of templates) {
      try {
        const perms = JSON.parse(t.permissions as string) as RolePermissions;
        parsed.push({ slug: t.slug, perms });
      } catch {
        /* skip */
      }
    }

    // Sólo reportamos config aquí (lo crítico del sprint)
    report.push("### 6b.1 Submódulos de `config` × template (solo BD)\n");
    const configSubs = SUBMODULE_KEYS.config;
    report.push(`| template | modulo:config | ${configSubs.join(" | ")} |`);
    report.push(`|---|---|${configSubs.map(() => "---").join("|")}|`);
    for (const { slug, perms } of parsed) {
      const row = [slug, perms.modules?.config ?? "none"];
      for (const sub of configSubs) {
        row.push(getEffectiveLevel(perms, "config", sub));
      }
      report.push(`| ${row.join(" | ")} |`);
    }
    report.push("");
  } catch (e) {
    report.push(`**BLOQUE 6b FALLÓ**: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  console.log(report.join("\n"));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
