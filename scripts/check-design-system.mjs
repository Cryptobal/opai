#!/usr/bin/env node
/**
 * OPAI Design System — Pre-Commit Guard
 *
 * Escanea archivos staged (.tsx / .ts / .css) y rechaza el commit si encuentra
 * violaciones del Design System v3 dentro de módulos ya migrados.
 *
 * Modo:
 *   - "strict"  → bloquea commit, exit 1
 *   - "warn"    → muestra warnings, exit 0
 *
 * El modo se decide POR ARCHIVO según MIGRATED_PATHS (lista abajo). Cuando un
 * módulo termina de migrar, se agrega su prefijo a la lista y a partir de ese
 * momento queda protegido.
 *
 * Uso:
 *   node scripts/check-design-system.mjs              ← solo staged (pre-commit)
 *   node scripts/check-design-system.mjs --all        ← repo entero (CI / manual)
 *   node scripts/check-design-system.mjs --warn-only  ← nunca bloquea, solo reporta
 *
 * Escape hatch:
 *   Si una primera línea contiene "// @ds-allow-legacy <razón>", el archivo se salta.
 *   Usar SOLO en casos justificados; las concesiones quedan visibles con:
 *     git grep "@ds-allow-legacy"
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ───────────────────────────────────────────────────────────────────
// Lista de módulos YA MIGRADOS (modo strict).
// Editar al terminar cada migración. Ver AGENTS.md sección "DS Migration Status".
// ───────────────────────────────────────────────────────────────────
const MIGRATED_PATHS = [
  "src/components/inventario/",
  "src/app/(app)/ops/inventario/",
  "src/components/opai-ds/",
  // Conocimiento — fase A: page + componentes hojas. _primitives.tsx
  // sigue intacto porque Portal Cliente lo consume; se elimina en fase B.
  "src/components/opai/conocimiento/InstallationCard.tsx",
  "src/components/opai/conocimiento/InstallationTile.tsx",
  "src/components/opai/conocimiento/SectionComplianceList.tsx",
  "src/components/opai/conocimiento/GuardsList.tsx",
  "src/components/opai/conocimiento/HeatmapMatrix.tsx",
  "src/app/(app)/personas/conocimiento/",
  // Portal Cliente — fase 3B: tab Conocimiento del equipo migrada.
  // Otros archivos del portal cliente (Bitácora, GuardiaDetalle, etc.)
  // no están migrados y se hacen en sesiones futuras.
  "src/components/portal/cliente/PortalConocimientoEquipo.tsx",
  "src/components/portal/cliente/PortalProtocolos.tsx",
  // Paso 4A — solo migró KpiCard/KpiGrid → Stat/StatGrid.
  // Los call sites NO se agregan a MIGRATED_PATHS porque el guard valida
  // archivos completos: estos archivos siguen teniendo colores hardcoded
  // y otros patrones legacy fuera del KPI. Cuando un módulo termine su
  // migración completa (no solo KPIs), agregar el path aquí.
  //
  // Paso 4B — consolidó EmptyState legacy → EmptyState DS v3 en 22 call sites
  // (docs/, finance/, ops/). Mismo criterio que 4A: los call sites NO se
  // agregan porque siguen teniendo otros patrones legacy (text-[10px],
  // hardcoded colors, etc.) fuera del EmptyState migrado.
  //
  // Paso 4C — consolidó DataTable legacy → DataTable DS v3 en 13 Client
  // Components (8 finance/ + 5 ops/rondas/). Mismo criterio: call sites NO
  // se agregan. Especialmente Rondas/* tiene drift dark-only (text-[#94a3b8],
  // bg-[#0a0f1c]) que se aborda en una sesión futura específica de Rondas.
  // Los 3 Server Component pages (auditoria, audit-pautas, payroll/parameters)
  // NO se migraron — quedan con DataTable legacy hasta sesión 4F (column
  // defs con render functions no cruzan la frontera RSC).
  //
  // Paso 4D — cluster final chico (Avatar, Breadcrumb, LoadingSpinner,
  // StatusBadge, FilterBar, ModuleCard, Stepper, FormField). 8 componentes
  // legacy eliminados. Mismo criterio: los call sites NO se agregan a
  // MIGRATED_PATHS porque siguen teniendo otros patrones legacy fuera de
  // los componentes migrados. Único helper nuevo agregado: StatusTag.
  "src/components/ops/StatusTag.tsx",
  // Agregar aquí cuando se migren:
  // "src/components/personas/",
  // "src/components/crm/",
  // "src/components/documentos/",
];

// ───────────────────────────────────────────────────────────────────
// DS_SOURCE_PATHS — archivos que DEFINEN el design system.
// Aquí se permiten patrones que en código de aplicación serían drift,
// porque el DS toma decisiones que después el resto consume.
//
// Ejemplos legítimos en esta zona (NO en otros archivos):
//   - text-[11px] sin marcas eyebrow (numéricos mono, pills chicos)
//   - tamaños arbitrarios definidos como variants de un componente
//
// Sigue prohibido aquí: text-[10px], colores hardcoded, dark-only.
// ───────────────────────────────────────────────────────────────────
const DS_SOURCE_PATHS = [
  "src/components/opai-ds/Surface.tsx",
  "src/components/opai-ds/SectionHeader.tsx",
  "src/components/opai-ds/PageHero.tsx",
  "src/components/opai-ds/Stat.tsx",
  "src/components/opai-ds/Tag.tsx",
  "src/components/opai-ds/StatusDot.tsx",
  "src/components/opai-ds/IconBubble.tsx",
  "src/components/opai-ds/EmptyState.tsx",
  "src/components/opai-ds/Spinner.tsx",
  "src/components/opai-ds/Skeleton.tsx",
  "src/components/opai-ds/MetricBar.tsx",
  "src/components/opai-ds/Toolbar.tsx",
  "src/components/opai-ds/DataTable.tsx",
  "src/components/opai-ds/DataView.tsx",
  "src/components/opai-ds/HeatGrid.tsx",
  "src/components/opai-ds/Avatar.tsx",
  "src/components/opai-ds/Breadcrumbs.tsx",
  "src/components/opai-ds/KPICard.tsx",
];
// Nota: NO incluye index.ts ni tokens.ts. Esos son barrel/helpers, no
// definen patrones visuales y deben seguir las mismas reglas que app code.

// Carpetas SIEMPRE excluidas (legacy permitido por diseño).
const ALWAYS_EXCLUDED = [
  "src/app/(marketing)/",
  "src/components/templates/",
  "src/components/opai/conocimiento/_primitives.tsx",
  "src/components/ui/",          // shadcn base, no es parte del DS
  "node_modules/",
  ".next/",
  "scripts/",                    // este script y check-pii
];

// ───────────────────────────────────────────────────────────────────
// REGLAS — cada una con un patrón regex y un mensaje
// ───────────────────────────────────────────────────────────────────
//
// Importante: las reglas son del tipo "lo prohibido". Cada regla:
//   - id: identificador corto.
//   - test: regex que detecta la violación. Debe usar `g` para multi-match.
//   - message: explicación humana.
//   - fix: sugerencia de remplazo.
//   - severity: "error" (bloquea en strict) | "warn" (nunca bloquea).
//   - scope: "tsx" | "css" | "any". Filtra a qué archivos aplica la regla.
//

const RULES = [
  // ─── Tipografía mínima ───────────────────────────────────────
  {
    id: "no-tiny-text",
    // text-[10px] siempre prohibido. text-[11px] solo prohibido cuando NO va
    // acompañado de las 3 marcas de eyebrow (font-mono + uppercase + tracking-).
    // Estrategia: detectamos tanto text-[10px] (siempre malo) como text-[11px]
    // y luego en validación per-match revisamos si está dentro del patrón eyebrow.
    test: /text-\[(10|11)px\]/g,
    message: "Tipografía menor a 12px no es legible en mobile.",
    fix: "Usa text-[12px] o text-[13px]. Si es un eyebrow decorativo, agrega font-mono + uppercase + tracking-[0.08em] (ej: text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4).",
    severity: "error",
    scope: "tsx",
    // Función de validación contextual: si retorna true, el match SE PERMITE.
    // Recibe el match, el texto completo del archivo, el índice del match y
    // el path del archivo (opcional, usado para excepciones por zona).
    allowIfContext: (match, content, index, filePath) => {
      // text-[10px] nunca se permite, sin excepciones
      if (match[0] === "text-[10px]") return false;

      // text-[11px] en archivos DS source: permitido (decisión del DS).
      if (filePath && isDsSource(filePath)) return true;

      // text-[11px] en código de aplicación: aceptar SOLO si está en un
      // className que también incluya font-mono + uppercase + tracking-*
      // (las 3 marcas del eyebrow editorial).
      const before = content.lastIndexOf('className="', index);
      if (before === -1) return false;
      const after = content.indexOf('"', index);
      if (after === -1 || after - before > 800) return false;
      const classBlock = content.slice(before, after);

      const hasMono = /\bfont-mono\b/.test(classBlock);
      const hasUpper = /\buppercase\b/.test(classBlock);
      const hasTracking = /\btracking-/.test(classBlock);

      return hasMono && hasUpper && hasTracking;
    },
  },

  // ─── Colores hardcoded (deben ir por token semántico) ────────
  {
    id: "no-hardcoded-emerald",
    test: /\btext-emerald-(300|400|500|600|700)\b/g,
    message: "Color emerald hardcoded.",
    fix: "Usar text-status-ok-fg.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-amber",
    test: /\btext-amber-(300|400|500|600|700)\b/g,
    message: "Color amber hardcoded.",
    fix: "Usar text-status-warn-fg.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-red",
    test: /\btext-red-(300|400|500|600|700)\b/g,
    message: "Color red hardcoded.",
    fix: "Usar text-status-danger-fg.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-blue",
    test: /\btext-blue-(300|400)\b/g,
    message: "Color blue hardcoded.",
    fix: "Usar text-status-info-fg o text-primary según contexto.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-bg-emerald",
    test: /\bbg-emerald-500\/(5|10|15|20)\b/g,
    message: "Background emerald hardcoded.",
    fix: "Usar bg-status-ok-soft.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-bg-amber",
    test: /\bbg-amber-500\/(5|10|15|20)\b/g,
    message: "Background amber hardcoded.",
    fix: "Usar bg-status-warn-soft.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-bg-red",
    test: /\bbg-red-500\/(5|10|15|20)\b/g,
    message: "Background red hardcoded.",
    fix: "Usar bg-status-danger-soft.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-border-emerald",
    test: /\bborder-emerald-500\/(20|30|40|50)\b/g,
    message: "Border emerald hardcoded.",
    fix: "Usar border-status-ok-border.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-border-amber",
    test: /\bborder-amber-500\/(20|30|40|50)\b/g,
    message: "Border amber hardcoded.",
    fix: "Usar border-status-warn-border.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-border-red",
    test: /\bborder-red-500\/(20|30|40|50)\b/g,
    message: "Border red hardcoded.",
    fix: "Usar border-status-danger-border.",
    severity: "error",
    scope: "tsx",
  },

  // ─── White/black opacity (dark-only patterns) ────────────────
  {
    id: "no-text-white-opacity",
    test: /\btext-white\/(40|50|60|70)\b/g,
    message: "text-white/N es dark-only y rompe en light mode.",
    fix: "Usar text-ds-text-3 (secondary) o text-ds-text-4 (tertiary).",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-bg-white-opacity",
    test: /\bbg-white\/(02|03|04|05|10)\b/g,
    message: "bg-white/N es dark-only y desaparece en light mode.",
    fix: "Usar bg-ds-surface-1/2/3 según elevación.",
    severity: "error",
    scope: "tsx",
  },

  // ─── Clases dark-only legacy (card-mock, etc.) ───────────────
  {
    id: "no-card-mock",
    test: /\b(card-mock|card-mock-tight)\b/g,
    message: "card-mock es dark-only (rgba(255,255,255,...)).",
    fix: "Usar <Surface elevation={1} padding=...> de @/components/opai-ds.",
    severity: "error",
    scope: "any",
  },
  {
    id: "no-pill-mock",
    test: /\bpill-mock\b/g,
    message: "pill-mock es de Conocimiento (dark-only).",
    fix: "Usar <Tag variant=...> de @/components/opai-ds.",
    severity: "error",
    scope: "any",
  },
  {
    id: "no-bar-mock",
    test: /\bbar-mock\b/g,
    message: "bar-mock es de Conocimiento (dark-only).",
    fix: "Usar <MetricBar value={...}> de @/components/opai-ds.",
    severity: "error",
    scope: "any",
  },

  // ─── Imports prohibidos ──────────────────────────────────────
  {
    id: "no-conocimiento-primitives-import",
    test: /from\s+["']@\/components\/opai\/conocimiento\/_primitives["']/g,
    message: "Import de primitives de Conocimiento prohibido fuera de Conocimiento.",
    fix: "Importar de @/components/opai-ds (Stat, Tag, StatusDot, MetricBar).",
    severity: "error",
    scope: "tsx",
    // Excepción: Conocimiento puede importarse a sí mismo
    pathExclude: /src\/(components\/opai\/conocimiento|app\/.*conocimiento)/,
  },

  // ─── Touch targets — selects y inputs muy chicos ─────────────
  {
    id: "no-h8-input",
    test: /(SelectTrigger|<Input|<input)[^>]*className=["'][^"']*\bh-8\b/g,
    message: "Input/Select con h-8 (32px) es bajo el mínimo Apple HIG (44px) en mobile.",
    fix: 'className="h-10 sm:h-9" (44px mobile, 36px desktop).',
    severity: "warn", // warn porque hay cards-toggle y otros valid uses
    scope: "tsx",
  },

  // ─── OpaiSurface deprecated post-cleanup ─────────────────────
  // (Dejar comentado hasta que terminen TODAS las migraciones.)
  // {
  //   id: "no-opai-surface-legacy",
  //   test: /from\s+["']@\/components\/opai["']/g,
  //   message: "OpaiSurface/OpaiPageHero/OpaiSectionHeader fueron deprecados.",
  //   fix: "Importar de @/components/opai-ds.",
  //   severity: "error",
  //   scope: "tsx",
  // },
];

// ───────────────────────────────────────────────────────────────────
// Resolución de archivos
// ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE_ALL = args.includes("--all");
const FORCE_WARN = args.includes("--warn-only");

function getStagedFiles() {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getAllRepoFiles() {
  try {
    const out = execSync(
      "git ls-files 'src/**/*.tsx' 'src/**/*.ts' 'src/**/*.css'",
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

const files = MODE_ALL ? getAllRepoFiles() : getStagedFiles();

// ───────────────────────────────────────────────────────────────────
// Filtros y clasificación
// ───────────────────────────────────────────────────────────────────

function isExcludedAlways(path) {
  return ALWAYS_EXCLUDED.some((p) => path.startsWith(p) || path === p);
}

function isMigrated(path) {
  return MIGRATED_PATHS.some((p) => path.startsWith(p));
}

function isDsSource(path) {
  return DS_SOURCE_PATHS.includes(path);
}

/**
 * Devuelve una versión del contenido en la que los comentarios JS/TS/CSS
 * se reemplazan por espacios del mismo largo, preservando offsets de
 * caracteres y números de línea. Las reglas regex se aplican sobre esta
 * versión "limpia"; al reportar la línea, los offsets siguen siendo
 * correctos respecto al archivo original.
 *
 * Cubre:
 *   //  comentario hasta fin de línea
 *   / * ... * /  bloque (incluye JSDoc / ** ... * /)
 *
 * Mantiene strings y JSX literal intactos: solo neutraliza comentarios.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  const len = src.length;
  let inSingle = false;        // string '...'
  let inDouble = false;        // string "..."
  let inTemplate = false;      // template `...`
  let inLineComment = false;   // //
  let inBlockComment = false;  // /* */

  while (i < len) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch; // preserve newline
      } else {
        out += " ";
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        out += "  ";
        i += 2;
      } else {
        out += ch === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      // Escape sequence: copy verbatim
      if (ch === "\\" && i + 1 < len) {
        out += ch + src[i + 1];
        i += 2;
        continue;
      }
      if (inSingle && ch === "'") inSingle = false;
      else if (inDouble && ch === '"') inDouble = false;
      else if (inTemplate && ch === "`") inTemplate = false;
      out += ch;
      i++;
      continue;
    }

    // Detect comment starts
    if (ch === "/" && next === "/") {
      inLineComment = true;
      out += "  ";
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      out += "  ";
      i += 2;
      continue;
    }

    // Detect string starts
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === "`") inTemplate = true;

    out += ch;
    i++;
  }

  return out;
}

function getScope(path) {
  const ext = extname(path);
  if (ext === ".css") return "css";
  if (ext === ".tsx" || ext === ".ts" || ext === ".jsx" || ext === ".js") return "tsx";
  return null;
}

function hasLegacyAllow(content) {
  const firstLine = content.split("\n", 1)[0] || "";
  return firstLine.includes("@ds-allow-legacy");
}

// ───────────────────────────────────────────────────────────────────
// Scan
// ───────────────────────────────────────────────────────────────────

const errors = [];
const warnings = [];
const skipped = [];

for (const file of files) {
  if (isExcludedAlways(file)) continue;

  const scope = getScope(file);
  if (!scope) continue;

  if (!existsSync(file)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (hasLegacyAllow(content)) {
    skipped.push(file);
    continue;
  }

  const lines = content.split("\n");
  const scanContent = stripComments(content);
  const fileIsMigrated = isMigrated(file);

  for (const rule of RULES) {
    if (rule.scope !== "any" && rule.scope !== scope) continue;
    if (rule.pathExclude && rule.pathExclude.test(file)) continue;

    const re = new RegExp(rule.test.source, rule.test.flags);
    let match;
    while ((match = re.exec(scanContent)) !== null) {
      // Permitir match si la regla define un contexto válido
      if (rule.allowIfContext && rule.allowIfContext(match, content, match.index, file)) {
        continue;
      }

      // Localizar línea
      const upToMatch = content.slice(0, match.index);
      const lineNumber = upToMatch.split("\n").length;
      const lineText = lines[lineNumber - 1] || "";

      const violation = {
        file,
        line: lineNumber,
        ruleId: rule.id,
        message: rule.message,
        fix: rule.fix,
        snippet: lineText.trim().slice(0, 140),
      };

      // Si es módulo migrado → error real, si no → warning (mientras dura la migración)
      const effectiveSeverity =
        FORCE_WARN ? "warn" :
        rule.severity === "warn" ? "warn" :
        fileIsMigrated ? "error" : "warn";

      if (effectiveSeverity === "error") errors.push(violation);
      else warnings.push(violation);
    }
  }
}

// ───────────────────────────────────────────────────────────────────
// Reporte
// ───────────────────────────────────────────────────────────────────

function fmtViolation(v, color) {
  return [
    `${color}${BOLD}  ${v.file}:${v.line}${RESET}  ${DIM}[${v.ruleId}]${RESET}`,
    `    ${v.message}`,
    `    ${CYAN}→ ${v.fix}${RESET}`,
    `    ${DIM}${v.snippet}${RESET}`,
  ].join("\n");
}

const totalChecked = files.filter(
  (f) => !isExcludedAlways(f) && getScope(f),
).length;

console.log("");
console.log(`${BOLD}OPAI DS Guard${RESET} — checked ${totalChecked} file(s)${MODE_ALL ? " (full repo)" : " (staged)"}`);
console.log("");

if (skipped.length > 0) {
  console.log(`${DIM}Skipped (// @ds-allow-legacy): ${skipped.length}${RESET}`);
  for (const f of skipped) console.log(`${DIM}  - ${f}${RESET}`);
  console.log("");
}

if (warnings.length > 0) {
  console.log(`${YELLOW}${BOLD}⚠ ${warnings.length} warning(s) — module not yet migrated, fix-when-you-can:${RESET}`);
  for (const v of warnings) console.log(fmtViolation(v, YELLOW));
  console.log("");
}

if (errors.length > 0) {
  console.log(`${RED}${BOLD}✗ ${errors.length} error(s) in MIGRATED modules — must fix before commit:${RESET}`);
  for (const v of errors) console.log(fmtViolation(v, RED));
  console.log("");
  console.log(`${DIM}Tip: si tienes una razón legítima para una excepción puntual, agrega como primera línea del archivo:${RESET}`);
  console.log(`${DIM}  // @ds-allow-legacy <razón corta>${RESET}`);
  console.log("");
  process.exit(1);
}

if (errors.length === 0 && warnings.length === 0) {
  console.log(`${GREEN}✓ Design System OK${RESET}`);
}

process.exit(0);
