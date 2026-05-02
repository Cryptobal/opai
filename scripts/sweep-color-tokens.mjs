#!/usr/bin/env node
/**
 * scripts/sweep-color-tokens.mjs
 *
 * Barrida global de hex hardcoded → tokens semánticos del DS v3.
 * Lee el mapa de reemplazos del prompt 5B.0 y lo aplica a archivos
 * .tsx y .ts en src/, respetando exclusiones documentadas.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------
// 1) Configuración
// ---------------------------------------------------------------

/** Carpetas excluidas (NO se barren) */
const EXCLUDED_PATHS = [
  "src/components/presentation",
  "src/components/emails",
  "src/lib/emails",
  "src/app/login",
  "src/app/(auth)",
  "node_modules",
  ".next",
  "dist",
];

/** Comentario que marca un archivo como exento */
const ALLOW_LEGACY_MARKER = "@ds-allow-legacy";

/** Mapa canónico — orden importa. Más específico primero. */
const REPLACEMENTS = [
  // ============= TEXT — OK (verde) =============
  ["text-emerald-300", "text-status-ok-fg"],
  ["text-emerald-400", "text-status-ok-fg"],
  ["text-emerald-500", "text-status-ok-fg"],
  ["text-emerald-600", "text-status-ok-fg"],
  ["text-emerald-700", "text-status-ok-fg"],
  ["text-green-300", "text-status-ok-fg"],
  ["text-green-400", "text-status-ok-fg"],
  ["text-green-500", "text-status-ok-fg"],
  ["text-green-600", "text-status-ok-fg"],

  // ============= TEXT — WARN (ámbar) =============
  ["text-amber-200", "text-status-warn-fg"],
  ["text-amber-300", "text-status-warn-fg"],
  ["text-amber-400", "text-status-warn-fg"],
  ["text-amber-500", "text-status-warn-fg"],
  ["text-amber-600", "text-status-warn-fg"],
  ["text-amber-700", "text-status-warn-fg"],
  ["text-yellow-300", "text-status-warn-fg"],
  ["text-yellow-400", "text-status-warn-fg"],
  ["text-yellow-500", "text-status-warn-fg"],
  ["text-orange-300", "text-status-warn-fg"],
  ["text-orange-400", "text-status-warn-fg"],
  ["text-orange-500", "text-status-warn-fg"],

  // ============= TEXT — DANGER (rojo) =============
  ["text-red-300", "text-status-danger-fg"],
  ["text-red-400", "text-status-danger-fg"],
  ["text-red-500", "text-status-danger-fg"],
  ["text-red-600", "text-status-danger-fg"],
  ["text-red-700", "text-status-danger-fg"],
  ["text-rose-300", "text-status-danger-fg"],
  ["text-rose-400", "text-status-danger-fg"],
  ["text-rose-500", "text-status-danger-fg"],

  // ============= TEXT — INFO (azul) =============
  ["text-blue-300", "text-status-info-fg"],
  ["text-blue-400", "text-status-info-fg"],
  ["text-blue-500", "text-status-info-fg"],
  ["text-blue-600", "text-status-info-fg"],
  ["text-sky-300", "text-status-info-fg"],
  ["text-sky-400", "text-status-info-fg"],
  ["text-sky-500", "text-status-info-fg"],
  ["text-indigo-300", "text-status-info-fg"],
  ["text-indigo-400", "text-status-info-fg"],
  ["text-indigo-500", "text-status-info-fg"],
  ["text-cyan-300", "text-status-info-fg"],
  ["text-cyan-400", "text-status-info-fg"],
  ["text-cyan-500", "text-status-info-fg"],
  ["text-teal-300", "text-status-info-fg"],
  ["text-teal-400", "text-status-info-fg"],
  ["text-teal-500", "text-status-info-fg"],

  // ============= BG soft (con opacidad) =============
  // Verde
  ["bg-emerald-500/5", "bg-status-ok-soft"],
  ["bg-emerald-500/10", "bg-status-ok-soft"],
  ["bg-emerald-500/15", "bg-status-ok-soft"],
  ["bg-emerald-500/20", "bg-status-ok-soft"],
  ["bg-emerald-500/25", "bg-status-ok-soft"],
  ["bg-green-500/10", "bg-status-ok-soft"],
  ["bg-green-500/15", "bg-status-ok-soft"],
  // Ámbar
  ["bg-amber-500/5", "bg-status-warn-soft"],
  ["bg-amber-500/10", "bg-status-warn-soft"],
  ["bg-amber-500/15", "bg-status-warn-soft"],
  ["bg-amber-500/20", "bg-status-warn-soft"],
  ["bg-yellow-500/10", "bg-status-warn-soft"],
  ["bg-yellow-500/15", "bg-status-warn-soft"],
  ["bg-orange-500/10", "bg-status-warn-soft"],
  // Rojo
  ["bg-red-500/5", "bg-status-danger-soft"],
  ["bg-red-500/10", "bg-status-danger-soft"],
  ["bg-red-500/15", "bg-status-danger-soft"],
  ["bg-red-500/20", "bg-status-danger-soft"],
  ["bg-rose-500/10", "bg-status-danger-soft"],
  ["bg-rose-500/15", "bg-status-danger-soft"],
  // Azul
  ["bg-blue-500/5", "bg-status-info-soft"],
  ["bg-blue-500/10", "bg-status-info-soft"],
  ["bg-blue-500/15", "bg-status-info-soft"],
  ["bg-blue-500/20", "bg-status-info-soft"],
  ["bg-sky-500/10", "bg-status-info-soft"],
  ["bg-sky-500/15", "bg-status-info-soft"],
  ["bg-indigo-500/10", "bg-status-info-soft"],
  ["bg-indigo-500/15", "bg-status-info-soft"],
  ["bg-teal-500/10", "bg-status-info-soft"],
  ["bg-teal-500/15", "bg-status-info-soft"],
  ["bg-cyan-500/10", "bg-status-info-soft"],
  ["bg-cyan-500/15", "bg-status-info-soft"],

  // ============= BG solid (dots, chips) =============
  ["bg-emerald-500", "bg-status-ok"],
  ["bg-emerald-600", "bg-status-ok"],
  ["bg-green-500", "bg-status-ok"],
  ["bg-amber-500", "bg-status-warn"],
  ["bg-yellow-500", "bg-status-warn"],
  ["bg-orange-500", "bg-status-warn"],
  ["bg-red-500", "bg-status-danger"],
  ["bg-red-600", "bg-status-danger"],
  ["bg-rose-500", "bg-status-danger"],
  ["bg-blue-500", "bg-status-info"],
  ["bg-blue-600", "bg-status-info"],
  ["bg-sky-500", "bg-status-info"],
  ["bg-indigo-500", "bg-status-info"],
  ["bg-teal-500", "bg-status-info"],
  ["bg-teal-600", "bg-status-info"],

  // ============= BORDER soft =============
  ["border-emerald-500/20", "border-status-ok-border"],
  ["border-emerald-500/25", "border-status-ok-border"],
  ["border-emerald-500/30", "border-status-ok-border"],
  ["border-emerald-500/40", "border-status-ok-border"],
  ["border-emerald-500/50", "border-status-ok-border"],
  ["border-green-500/30", "border-status-ok-border"],
  ["border-amber-500/20", "border-status-warn-border"],
  ["border-amber-500/30", "border-status-warn-border"],
  ["border-amber-500/40", "border-status-warn-border"],
  ["border-amber-500/50", "border-status-warn-border"],
  ["border-yellow-500/30", "border-status-warn-border"],
  ["border-orange-500/30", "border-status-warn-border"],
  ["border-red-500/20", "border-status-danger-border"],
  ["border-red-500/30", "border-status-danger-border"],
  ["border-red-500/40", "border-status-danger-border"],
  ["border-red-500/50", "border-status-danger-border"],
  ["border-rose-500/30", "border-status-danger-border"],
  ["border-blue-500/20", "border-status-info-border"],
  ["border-blue-500/30", "border-status-info-border"],
  ["border-blue-500/40", "border-status-info-border"],
  ["border-blue-500/50", "border-status-info-border"],
  ["border-sky-500/30", "border-status-info-border"],
  ["border-indigo-500/30", "border-status-info-border"],
  ["border-teal-500/30", "border-status-info-border"],
  ["border-cyan-500/30", "border-status-info-border"],

  // ============= BORDER solid =============
  ["border-emerald-500", "border-status-ok-border"],
  ["border-amber-500", "border-status-warn-border"],
  ["border-red-500", "border-status-danger-border"],
  ["border-blue-500", "border-status-info-border"],
];

// ---------------------------------------------------------------
// 2) Lógica
// ---------------------------------------------------------------

/** Lista recursivamente .tsx y .ts en src/, excluyendo paths */
function listFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT, fullPath);

    // Skip excluded paths
    if (EXCLUDED_PATHS.some((excl) => relPath.startsWith(excl))) continue;

    if (entry.isDirectory()) {
      listFiles(fullPath, files);
    } else if (entry.isFile()) {
      if (
        (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

/** Devuelve true si el archivo tiene el marker @ds-allow-legacy */
function hasAllowLegacyMarker(content) {
  // Buscar en las primeras 20 líneas (suele estar en el comentario superior)
  const head = content.split("\n").slice(0, 20).join("\n");
  return head.includes(ALLOW_LEGACY_MARKER);
}

/** Aplica reemplazos a un string de contenido. Devuelve [newContent, changes]. */
function applyReplacements(content) {
  let newContent = content;
  let totalChanges = 0;

  for (const [from, to] of REPLACEMENTS) {
    // Usar regex con word boundary para evitar matches parciales
    // (ej. evitar que "text-red-500" matchee dentro de "text-red-500-foo")
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![a-zA-Z0-9-])${escaped}(?![a-zA-Z0-9-/])`, "g");

    const matches = newContent.match(regex);
    if (matches) {
      totalChanges += matches.length;
      newContent = newContent.replace(regex, to);
    }
  }

  return [newContent, totalChanges];
}

// ---------------------------------------------------------------
// 3) Ejecución
// ---------------------------------------------------------------

console.log("🎨 Sweep de tokens semánticos — DS v3");
console.log("─".repeat(50));

const srcDir = path.join(ROOT, "src");
const files = listFiles(srcDir);

console.log(`📁 Archivos a escanear: ${files.length}`);
console.log("");

let totalFilesModified = 0;
let totalReplacements = 0;
const skippedAllowLegacy = [];
const modified = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");

  if (hasAllowLegacyMarker(content)) {
    skippedAllowLegacy.push(path.relative(ROOT, file));
    continue;
  }

  const [newContent, changes] = applyReplacements(content);

  if (changes > 0) {
    fs.writeFileSync(file, newContent, "utf-8");
    totalFilesModified++;
    totalReplacements += changes;
    modified.push({ file: path.relative(ROOT, file), changes });
  }
}

// ---------------------------------------------------------------
// 4) Reporte
// ---------------------------------------------------------------

console.log(`✅ Archivos modificados: ${totalFilesModified}`);
console.log(`✅ Reemplazos totales: ${totalReplacements}`);
console.log(`⏭️  Archivos exentos (@ds-allow-legacy): ${skippedAllowLegacy.length}`);

if (skippedAllowLegacy.length > 0) {
  console.log("");
  console.log("Archivos exentos:");
  skippedAllowLegacy.forEach((f) => console.log(`  - ${f}`));
}

console.log("");
console.log("Top 20 archivos con más reemplazos:");
modified
  .sort((a, b) => b.changes - a.changes)
  .slice(0, 20)
  .forEach((m) => console.log(`  ${String(m.changes).padStart(4)} — ${m.file}`));

console.log("");
console.log("─".repeat(50));
console.log("✅ Sweep completado. Próximo paso: npx tsc --noEmit && npm run build");
