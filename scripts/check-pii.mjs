#!/usr/bin/env node
/**
 * PII Detection Pre-Commit Hook
 *
 * Escanea archivos staged y aborta el commit si encuentra:
 * - RUTs chilenos en formato XX.XXX.XXX-X o XXXXXXXX-X (no plantilla 11111111-1, etc.)
 * - Bloques de 16+ dígitos consecutivos (tarjetas)
 * - Filenames que matcheen patrones de archivos de PII
 *
 * Permite samples anonimizados en docs/02-implementation/payroll/sample-formats/
 *
 * Uso (manual): node scripts/check-pii.mjs
 * Uso (auto): se invoca desde .husky/pre-commit
 */

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, basename } from "node:path";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

// ───────────────────────────────────────────────────────────────────
// Configuración
// ───────────────────────────────────────────────────────────────────

const ALLOWED_RUT_PLACEHOLDERS = new Set([
  "11111111-1", "22222222-2", "33333333-3", "44444444-4", "55555555-5",
  "66666666-6", "77777777-7", "88888888-8", "99999999-9", "12345678-5",
  "11.111.111-1", "22.222.222-2", "12.345.678-5",
  // Common placeholder values used in input fields across the UI.
  "12.345.678-9", "76.123.456-7",
  // Example RUT used in email-lead-extractor.ts docstring to illustrate format.
  "77.985.438-8",
]);

const SAMPLE_PATHS_ALLOWLIST = [
  "docs/02-implementation/payroll/sample-formats/",
  "docs/_archive/",
  "scripts/_archive/",
];

const SUSPICIOUS_FILENAME_PATTERNS = [
  /libro[_-]?remuneraciones?/i,
  /libro[_-]?imposiciones?/i,
  /^LIBRO_/,
  /previred/i,
  /F30/i,
  /nomina/i,
  /asistencias.*\.csv$/i,
];

const RUT_PATTERN = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;

const LONG_DIGITS_PATTERN = /\b\d{16,}\b/g;

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".pdf", ".woff", ".woff2", ".ttf", ".otf",
  ".lock", ".lockb", ".log",
  ".zip", ".tar", ".gz", ".rar",
]);

const SKIP_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// ───────────────────────────────────────────────────────────────────
// Lógica
// ───────────────────────────────────────────────────────────────────

function getStagedFiles() {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    });
    return out.split("\n").filter(Boolean);
  } catch (err) {
    console.error(`${RED}Error reading staged files:${RESET}`, err.message);
    process.exit(1);
  }
}

function isInAllowlist(path) {
  return SAMPLE_PATHS_ALLOWLIST.some((prefix) => path.startsWith(prefix));
}

function shouldSkipFile(path) {
  const ext = extname(path).toLowerCase();
  const name = basename(path);
  if (SKIP_EXTENSIONS.has(ext)) return true;
  if (SKIP_FILES.has(name)) return true;
  if (path === "scripts/check-pii.mjs") return true;
  try {
    const size = statSync(path).size;
    if (size > MAX_FILE_SIZE_BYTES) return true;
  } catch {
    return true;
  }
  return false;
}

function checkFilenameSuspicious(path) {
  if (isInAllowlist(path)) return null;
  const name = basename(path);
  for (const pattern of SUSPICIOUS_FILENAME_PATTERNS) {
    if (pattern.test(name)) {
      return `Filename matches PII-suspicious pattern: ${pattern}`;
    }
  }
  return null;
}

function checkContent(path) {
  const issues = [];

  if (isInAllowlist(path)) return issues;

  let content;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return issues;
  }

  // Strip SVG path data so coordinates like "M17.472 14.382 ..." don't get
  // flagged as RUTs (the RUT regex matches numbers separated by dots).
  const contentWithoutSvgPaths = content.replace(/\sd=["'][^"']*["']/g, "");
  const ruts = contentWithoutSvgPaths.match(RUT_PATTERN) || [];
  const realRuts = ruts.filter((r) => !ALLOWED_RUT_PLACEHOLDERS.has(r));
  if (realRuts.length > 0) {
    const sample = [...new Set(realRuts)].slice(0, 3).join(", ");
    issues.push(
      `Found ${realRuts.length} RUT(s) that look real (not placeholders). Sample: ${sample}`
    );
  }

  const longDigits = content.match(LONG_DIGITS_PATTERN) || [];
  if (longDigits.length > 0) {
    issues.push(
      `Found ${longDigits.length} block(s) of 16+ consecutive digits (possible card numbers).`
    );
  }

  return issues;
}

// ───────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────

const stagedFiles = getStagedFiles();

if (stagedFiles.length === 0) {
  process.exit(0);
}

const violations = [];

for (const path of stagedFiles) {
  const fnIssue = checkFilenameSuspicious(path);
  if (fnIssue) {
    violations.push({ path, issues: [fnIssue] });
    continue;
  }

  if (shouldSkipFile(path)) continue;
  const contentIssues = checkContent(path);
  if (contentIssues.length > 0) {
    violations.push({ path, issues: contentIssues });
  }
}

if (violations.length === 0) {
  console.log(`${GREEN}\u2713 PII check passed (${stagedFiles.length} files scanned)${RESET}`);
  process.exit(0);
}

console.error("");
console.error(`${RED}\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557${RESET}`);
console.error(`${RED}\u2551  \u26d4 COMMIT BLOCKED: posible PII detectada en archivos staged  \u2551${RESET}`);
console.error(`${RED}\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d${RESET}`);
console.error("");

for (const v of violations) {
  console.error(`${YELLOW}\ud83d\udcc4 ${v.path}${RESET}`);
  for (const issue of v.issues) {
    console.error(`   ${RED}\u2717${RESET} ${issue}`);
  }
  console.error("");
}

console.error(`${YELLOW}\u00bfQu\u00e9 hacer?${RESET}`);
console.error(`  1. Si es PII real: NO la commitees. Borr\u00e1 los archivos del staging`);
console.error(`     con: ${GREEN}git reset HEAD <archivo>${RESET}`);
console.error(`     y movelos fuera del repo.`);
console.error(`  2. Si es un sample anonimizado: ponelo en`);
console.error(`     ${GREEN}docs/02-implementation/payroll/sample-formats/${RESET}`);
console.error(`  3. Si es un falso positivo leg\u00edtimo: revisar ${GREEN}scripts/check-pii.mjs${RESET}`);
console.error(`     y agregar el caso al allowlist.`);
console.error(`  4. EMERGENCIA (\u00faltimo recurso, dej\u00e1 comentario en el commit):`);
console.error(`     ${YELLOW}git commit --no-verify${RESET}`);
console.error("");

process.exit(1);
