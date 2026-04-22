// AUDIT SCRIPT — READ ONLY
// Genera la matriz rol × submódulo desde los DEFAULTS del código.

import {
  DEFAULT_ROLE_PERMISSIONS,
  SUBMODULE_KEYS,
  MODULE_KEYS,
  getEffectiveLevel,
  normalizeRole,
  type ModuleKey,
} from "../src/lib/permissions";

const ROLES_TO_TEST = [
  "owner",
  "admin",
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
out.push("## 6. Matriz rol × submódulo (defaults en código)\n");
out.push("| Rol | Módulo | Submódulo | Nivel efectivo |");
out.push("|---|---|---|---|");

for (const role of ROLES_TO_TEST) {
  const normalized = normalizeRole(role);
  const perms = DEFAULT_ROLE_PERMISSIONS[normalized];
  if (!perms) {
    out.push(`| ${role} | — | — | ROL NO EXISTE |`);
    continue;
  }
  for (const mod of MODULE_KEYS) {
    const lvl = getEffectiveLevel(perms, mod);
    out.push(`| ${role} | ${mod} | — | ${lvl} |`);
    const subs = SUBMODULE_KEYS[mod as ModuleKey] as readonly string[];
    for (const sub of subs) {
      const sublvl = getEffectiveLevel(perms, mod, sub);
      out.push(`| ${role} | ${mod} | ${sub} | ${sublvl} |`);
    }
  }
}

// Resumen condensado: config submodules
out.push("\n### 6.1 Resumen — config submódulos (crítico para este sprint)\n");
const configSubs = SUBMODULE_KEYS.config as readonly string[];
out.push(`| rol | modulo:config | ${configSubs.join(" | ")} |`);
out.push(`|---|---|${configSubs.map(() => "---").join("|")}|`);

for (const role of ROLES_TO_TEST) {
  const perms = DEFAULT_ROLE_PERMISSIONS[normalizeRole(role)];
  if (!perms) continue;
  const row = [role, perms.modules?.config ?? "none"];
  for (const sub of configSubs) {
    row.push(getEffectiveLevel(perms, "config", sub));
  }
  out.push(`| ${row.join(" | ")} |`);
}

console.log(out.join("\n"));
