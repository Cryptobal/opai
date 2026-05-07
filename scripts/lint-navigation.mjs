#!/usr/bin/env node
/**
 * lint-navigation — guard contra anti-patrones del refactor "gold standard".
 *
 * Falla con exit code 1 si encuentra:
 *   - <ModuleSubNav ... /> dentro de un page.tsx (debe estar en layout.tsx).
 *   - eyebrow= como prop de <PageHero> (la prop fue eliminada en favor
 *     de breadcrumbs auto-derivados del registry).
 *
 * Para ejecutar:
 *   node scripts/lint-navigation.mjs
 *   npm run lint:nav        (atajo)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = "src/app/(app)";
const violations = [];

/**
 * Excepciones documentadas (Option B del refactor "gold standard"):
 * páginas que viven en distintas carpetas hermanas pero comparten N3.
 * Next.js no permite un layout único para rutas no anidadas, así que
 * estas pages mantienen `<ModuleSubNav>` inline.
 *
 * Si moves alguna ruta y unificas el N3 bajo una carpeta común, eliminá
 * la entrada correspondiente de esta allowlist y migrá a layout-driven.
 */
const INLINE_SUBNAV_ALLOWLIST = new Set([
  // Pautas — rutas hermanas bajo /ops/* sin prefijo común
  "src/app/(app)/ops/pauta-mensual/page.tsx",
  "src/app/(app)/ops/pauta-diaria/page.tsx",
  "src/app/(app)/ops/turnos-extra/page.tsx",
  "src/app/(app)/ops/refuerzos/page.tsx",
  "src/app/(app)/ops/ppc/page.tsx",
  "src/app/(app)/ops/marcaciones/page.tsx",
  "src/app/(app)/ops/audit-pautas/page.tsx",
  // Documentos-operativos vive como hermano de /opai/documentos/*
  "src/app/(app)/opai/documentos-operativos/page.tsx",
]);

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const f of entries) {
    const p = join(dir, f);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(p);
    } else if (p.endsWith("page.tsx")) {
      checkPage(p);
    }
  }
}

function checkPage(path) {
  const content = readFileSync(path, "utf8");
  // Normalize path separators for cross-platform allowlist comparison.
  const normalized = path.replace(/\\/g, "/");
  if (
    /<ModuleSubNav\b/.test(content) &&
    !INLINE_SUBNAV_ALLOWLIST.has(normalized)
  ) {
    violations.push({
      path,
      rule: "module-subnav-inline",
      msg: "ModuleSubNav inline (debe ir en layout.tsx, no page.tsx)",
    });
  }
  // We want eyebrow only when used as a JSX prop of PageHero. Heuristic:
  // any `eyebrow=` line in a file that ALSO uses <PageHero. (SectionHeader
  // and other components legitimately use eyebrow= and live in /components,
  // not /app/(app)/, so they're not scanned.)
  if (/<PageHero\b/.test(content) && /\beyebrow=/.test(content)) {
    violations.push({
      path,
      rule: "page-hero-eyebrow",
      msg: "PageHero eyebrow prop fue eliminada (usar AutoBreadcrumbs)",
    });
  }
}

walk(APP_ROOT);

if (violations.length > 0) {
  console.error("❌ Navigation lint failures:");
  for (const v of violations) {
    console.error(`  - ${v.path}: ${v.msg}`);
  }
  console.error(`\nVer docs/NAVIGATION_GUIDE.md para el patrón estándar.`);
  process.exit(1);
} else {
  console.log("✅ Navigation lint OK (no anti-patterns found)");
}
