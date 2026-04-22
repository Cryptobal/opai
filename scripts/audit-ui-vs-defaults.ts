// AUDIT SCRIPT — READ ONLY
// Compara CONFIG_SECTIONS (UI) contra SUBMODULE_KEYS y DEFAULT_ROLE_PERMISSIONS.

import {
  DEFAULT_ROLE_PERMISSIONS,
  SUBMODULE_KEYS,
  canView,
  normalizeRole,
  type RolePermissions,
} from "../src/lib/permissions";

// Réplica de CONFIG_SECTIONS tal como está en src/app/(app)/opai/configuracion/page.tsx
// (lectura manual — si cambia el original, actualizar aquí)
type ConfigItem = {
  submodule: string;
  href: string;
  title: string;
  adminOnly?: boolean;
};

const CONFIG_ITEMS: ConfigItem[] = [
  // General
  { submodule: "usuarios", href: "/opai/configuracion/empresa", title: "Datos de la Empresa", adminOnly: true },
  { submodule: "usuarios", href: "/opai/configuracion/usuarios", title: "Usuarios" },
  { submodule: "usuarios", href: "/opai/configuracion/roles", title: "Roles y Permisos", adminOnly: true },
  { submodule: "grupos", href: "/opai/configuracion/grupos", title: "Grupos" },
  { submodule: "integraciones", href: "/opai/configuracion/integraciones", title: "Integraciones" },
  { submodule: "notificaciones", href: "/opai/configuracion/notificaciones", title: "Notificaciones" },
  { submodule: "notificaciones", href: "/opai/configuracion/asistente-ia", title: "Asistente IA", adminOnly: true },
  { submodule: "usuarios", href: "/opai/configuracion/auditoria", title: "Auditoría", adminOnly: true },
  { submodule: "usuarios", href: "/opai/configuracion/documentos-operacionales", title: "Documentos Operacionales", adminOnly: true },
  { submodule: "usuarios", href: "/opai/configuracion/mi-plan", title: "Mi Plan", adminOnly: true },
  // Correos y Documentos
  { submodule: "firmas", href: "/opai/configuracion/firmas", title: "Firmas" },
  { submodule: "categorias", href: "/opai/configuracion/categorias-plantillas", title: "Categorías de plantillas" },
  // Compliance
  { submodule: "usuarios", href: "/opai/configuracion/cumplimiento", title: "Cumplimiento", adminOnly: true },
  // Módulos
  { submodule: "crm", href: "/opai/configuracion/crm", title: "CRM" },
  { submodule: "cpq", href: "/opai/configuracion/cpq", title: "Cotizaciones (CPQ)" },
  { submodule: "payroll", href: "/opai/configuracion/payroll", title: "Payroll" },
  { submodule: "ops", href: "/opai/configuracion/ops", title: "Operaciones" },
  { submodule: "tipos_ticket", href: "/opai/configuracion/tipos-ticket", title: "Tipos de Ticket" },
  { submodule: "finanzas", href: "/opai/configuracion/finanzas", title: "Finanzas" },
  { submodule: "gamificacion", href: "/opai/configuracion/gamificacion", title: "Gamificación", adminOnly: true },
  { submodule: "alertas_cobertura", href: "/opai/configuracion/alertas-cobertura", title: "Alertas de Cobertura" },
  { submodule: "ats", href: "/opai/configuracion/ats", title: "ATS — Reclutamiento" },
];

const ROLES_NON_ADMIN = [
  "editor",
  "jefe_operaciones",
  "central_monitoreo",
  "supervisor",
  "viewer",
  "rrhh",
  "operaciones",
  "finanzas",
  "reclutamiento",
  "solo_ops",
  "solo_crm",
  "solo_documentos",
  "solo_payroll",
  "inspector_dt",
];

const out: string[] = [];
out.push("## 7. Contradicciones UI ↔ Defaults\n");

// Cat 1: items en UI pero submódulo NO existe en catálogo
const validSubs = SUBMODULE_KEYS.config as readonly string[];
const notInCatalog = CONFIG_ITEMS.filter((i) => !validSubs.includes(i.submodule));
out.push("### 7.1 Ítems en UI cuyo `submodule` NO existe en SUBMODULE_KEYS.config\n");
out.push("(Si validatePermissions se ejecutara sobre un RoleTemplate con estas keys, fallaría)\n");
out.push("| title | href | submodule declarado |");
out.push("|---|---|---|");
if (notInCatalog.length === 0) out.push("| (ninguno) | | |");
for (const i of notInCatalog) {
  out.push(`| ${i.title} | ${i.href} | **${i.submodule}** ❌ |`);
}
out.push("");

// Cat 2: items adminOnly pero que no-admin tendría view por defaults
out.push("### 7.2 Ítems marcados `adminOnly` PERO que no-admin vería por defaults\n");
out.push("(contradicción: la UI oculta a no-admins algo que sus defaults permitirían)\n");
out.push("| title | submodule | roles no-admin que podrían ver |");
out.push("|---|---|---|");
let any72 = false;
for (const item of CONFIG_ITEMS.filter((i) => i.adminOnly)) {
  const rolesCanSee = ROLES_NON_ADMIN.filter((r) => {
    const perms = DEFAULT_ROLE_PERMISSIONS[normalizeRole(r)];
    if (!perms) return false;
    if (!validSubs.includes(item.submodule)) return false; // si no existe en catálogo, canView será por cascada de módulo
    return canView(perms, "config", item.submodule);
  });
  if (rolesCanSee.length > 0) {
    any72 = true;
    out.push(`| ${item.title} | ${item.submodule} | ${rolesCanSee.join(", ")} |`);
  }
}
if (!any72) out.push("| (ninguno) | | |");
out.push("");

// Cat 3: items NO marcados adminOnly pero que no-admin NO puede ver
out.push("### 7.3 Ítems NO `adminOnly` pero que no-admin NO puede ver por defaults\n");
out.push("(bug UX: items que deberían ser visibles a todos pero quedan ocultos)\n");
out.push("| title | submodule | roles no-admin bloqueados |");
out.push("|---|---|---|");
let any73 = false;
for (const item of CONFIG_ITEMS.filter((i) => !i.adminOnly)) {
  const blocked = ROLES_NON_ADMIN.filter((r) => {
    const perms = DEFAULT_ROLE_PERMISSIONS[normalizeRole(r)];
    if (!perms) return false;
    return !canView(perms, "config", item.submodule);
  });
  if (blocked.length > 0) {
    any73 = true;
    out.push(`| ${item.title} | ${item.submodule} | ${blocked.length}/${ROLES_NON_ADMIN.length}: ${blocked.join(", ")} |`);
  }
}
if (!any73) out.push("| (ninguno) | | |");
out.push("");

// Resumen global por rol: ¿cuántos items verían en Configuración por defaults?
out.push("### 7.4 Ítems visibles en Configuración por rol (solo defaults)\n");
out.push("(incluye el guard de página + filtro UI `adminOnly`)\n");
out.push("| rol | módulo config | items visibles UI | lista |");
out.push("|---|---|---:|---|");

for (const role of ["owner", "admin", ...ROLES_NON_ADMIN]) {
  const perms: RolePermissions | undefined = DEFAULT_ROLE_PERMISSIONS[normalizeRole(role)];
  if (!perms) continue;
  const isAdmin = role === "owner" || role === "admin";
  const configLevel = perms.modules?.config ?? "none";
  const visible = CONFIG_ITEMS.filter((i) => {
    if (i.adminOnly && !isAdmin) return false;
    return canView(perms, "config", i.submodule);
  });
  out.push(
    `| ${role} | ${configLevel} | ${visible.length}/${CONFIG_ITEMS.length} | ${visible.map((v) => v.title).join(", ") || "—"} |`,
  );
}

console.log(out.join("\n"));
