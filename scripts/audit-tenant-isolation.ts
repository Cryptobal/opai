/**
 * Auditoría estática de aislamiento multi-tenant en rutas API.
 *
 * Ejecutar: npm run audit:tenant
 *
 * Sale con código 1 si hay hallazgos no justificados.
 *
 * Detecciones:
 *  (a) Rutas autenticadas que usan Prisma sin mencionar tenantId ni
 *      requireInstallationAccess / requireGuardiaAccess / isGlobalCatalogWriter.
 *  (b) Mutaciones update/delete/updateMany/deleteMany cuyo `where` se apoya
 *      solo en `id` sin verificación de pertenencia previa en el handler
 *      (marcadores en ~1200 chars, o findFirst/findUnique con tenantId /
 *      installationId / helper de pertenencia desde el inicio del handler).
 */

import * as fs from "fs";
import * as path from "path";

const API_DIR = path.join(process.cwd(), "src/app/api");
const LOOKBACK = 1200;

const TENANT_MARKERS = [
  "tenantId",
  "tenant_id",
  "requireInstallationAccess",
  "requireGuardiaAccess",
  "isGlobalCatalogWriter",
];

const EXEMPT_PREFIXES = [
  "auth/",
  "public/",
  "cron/",
  "webhook/",
  "webhooks/",
  "fx/",
  "email-preview/",
  "test/",
  "platform/",
  "health/",
  "marcar/",
  "ronda/",
  "portal/",
  "whatsapp/",
  "mcp/",
];

/**
 * Excepciones justificadas (ruta relativa a src/app/api → motivo).
 */
const JUSTIFIED_EXCEPTIONS: Record<string, string> = {
  "me/preferences/route.ts":
    "Clave por adminId de la sesión; no hay recurso multi-tenant ajeno.",
  "me/preferences/[key]/route.ts":
    "Clave por adminId de la sesión; no hay recurso multi-tenant ajeno.",
  "me/preferences/hub-order/route.ts":
    "Preferencia de UI por adminId de sesión; no hay recurso multi-tenant ajeno.",
  "me/preferences/landing/route.ts":
    "Preferencia de UI por adminId de sesión; no hay recurso multi-tenant ajeno.",
  "me/surface/route.ts":
    "Preferencia de superficie por adminId de sesión; no hay recurso multi-tenant ajeno.",
  "payroll/fx/route.ts":
    "Tablas de UF/UTM nacionales compartidas; catálogo FX de lectura.",
  "crm/industries/route.ts":
    "POST de industrias es aditivo y deduplicado por nombre; no pisa datos ajenos.",
};

type Finding = {
  route: string;
  kind: "missing-tenant-marker" | "unsafe-id-mutation";
  detail: string;
  justified: boolean;
  reason?: string;
};

function walkRoutes(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkRoutes(full));
    else if (entry.name === "route.ts") results.push(full);
  }
  return results;
}

function toApiRelative(abs: string): string {
  return path.relative(API_DIR, abs).split(path.sep).join("/");
}

function isExempt(rel: string): boolean {
  return EXEMPT_PREFIXES.some(
    (p) => rel === p.replace(/\/$/, "") || rel.startsWith(p),
  );
}

function looksAuthenticated(content: string): boolean {
  return (
    content.includes("requireAuth") ||
    content.includes("ensureOpsAccess") ||
    content.includes("ensureModuleAccess")
  );
}

function usesPrisma(content: string): boolean {
  return content.includes("prisma.") || content.includes("@/lib/prisma");
}

function hasTenantMarker(content: string): boolean {
  return TENANT_MARKERS.some((m) => content.includes(m));
}

function hasImmediateScope(window: string): boolean {
  return (
    /requireInstallationAccess|requireGuardiaAccess|isGlobalCatalogWriter/.test(
      window,
    ) ||
    /tenantId\s*:/.test(window) ||
    /ctx\.tenantId/.test(window)
  );
}

/** ¿Hay verificación de pertenencia en el handler hasta esta posición? */
function hasHandlerScope(content: string, mutationIndex: number): boolean {
  const before = content.slice(0, mutationIndex);
  // Inicio del export async function más cercano
  const fnStarts = [...before.matchAll(/export\s+async\s+function\s+\w+/g)];
  const handlerStart = fnStarts.length > 0 ? fnStarts[fnStarts.length - 1].index! : 0;
  const handler = before.slice(handlerStart);

  if (
    /requireInstallationAccess|requireGuardiaAccess|isGlobalCatalogWriter/.test(
      handler,
    )
  ) {
    return true;
  }

  // El handler ya usa el tenant de la sesión (directo o vía helper de acceso)
  if (/ctx\.tenantId/.test(handler)) return true;

  // findFirst/findUnique con tenantId o installationId en el where
  if (
    /find(?:First|Unique)\s*\(\s*\{[\s\S]{0,600}?where\s*:\s*\{[\s\S]{0,400}?tenantId/.test(
      handler,
    )
  ) {
    return true;
  }
  if (
    /find(?:First|Unique)\s*\(\s*\{[\s\S]{0,600}?where\s*:\s*\{[\s\S]{0,400}?installationId/.test(
      handler,
    )
  ) {
    return true;
  }

  if (/where\s*:\s*\{[^}]*tenantId/.test(handler)) return true;

  return false;
}

function extractWhereBody(fromWhere: string): string | null {
  if (!/^where\s*:\s*\{/.test(fromWhere)) return null;
  let depth = 0;
  let i = fromWhere.indexOf("{");
  const start = i + 1;
  for (; i < fromWhere.length; i++) {
    if (fromWhere[i] === "{") depth++;
    else if (fromWhere[i] === "}") {
      depth--;
      if (depth === 0) return fromWhere.slice(start, i);
    }
  }
  return null;
}

function isOnlyScalarIdWhere(whereBody: string): boolean {
  const trimmed = whereBody.trim();
  if (/^id\s*$/.test(trimmed)) return true;
  if (/^id\s*:\s*[A-Za-z_][\w.]*\s*$/.test(trimmed)) return true;
  return false;
}

/** where id: auth.tenantId / ctx.tenantId — mutación del propio tenant, OK. */
function isSelfTenantIdWhere(whereBody: string): boolean {
  return /id\s*:\s*(?:ctx|auth)\.tenantId/.test(whereBody);
}

function findUnsafeIdMutations(content: string): string[] {
  const hits: string[] = [];
  const callRe =
    /prisma(?:\.\w+)+\.(update|delete|updateMany|deleteMany)\s*\(\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = callRe.exec(content)) !== null) {
    const method = match[1];
    const objStart = match.index + match[0].length - 1;
    const snippet = content.slice(objStart, objStart + 500);
    const whereIdx = snippet.search(/where\s*:\s*\{/);
    if (whereIdx < 0) continue;
    const whereBody = extractWhereBody(snippet.slice(whereIdx));
    if (whereBody === null) continue;
    if (!isOnlyScalarIdWhere(whereBody)) continue;
    if (isSelfTenantIdWhere(whereBody)) continue;

    const window = content.slice(
      Math.max(0, match.index - LOOKBACK),
      match.index,
    );
    if (hasImmediateScope(window)) continue;
    if (hasHandlerScope(content, match.index)) continue;

    hits.push(`${method} where={${whereBody.trim().replace(/\s+/g, " ")}}`);
  }
  return hits;
}

function main() {
  const routes = walkRoutes(API_DIR);
  const findings: Finding[] = [];

  for (const abs of routes) {
    const rel = toApiRelative(abs);
    if (isExempt(rel)) continue;

    const content = fs.readFileSync(abs, "utf-8");
    if (!looksAuthenticated(content) || !usesPrisma(content)) continue;

    const justifiedReason = JUSTIFIED_EXCEPTIONS[rel];

    if (!hasTenantMarker(content)) {
      findings.push({
        route: `src/app/api/${rel}`,
        kind: "missing-tenant-marker",
        detail:
          "Ruta autenticada con Prisma sin tenantId ni helper de pertenencia",
        justified: Boolean(justifiedReason),
        reason: justifiedReason,
      });
    }

    for (const detail of findUnsafeIdMutations(content)) {
      findings.push({
        route: `src/app/api/${rel}`,
        kind: "unsafe-id-mutation",
        detail: `Mutación por id sin verificación previa de pertenencia: ${detail}`,
        justified: Boolean(justifiedReason),
        reason: justifiedReason,
      });
    }
  }

  const open = findings.filter((f) => !f.justified);
  const justified = findings.filter((f) => f.justified);

  console.log("\n=== AUDIT DE AISLAMIENTO MULTITENANT ===");
  console.log(`Total rutas API: ${routes.length}`);
  console.log(`Hallazgos abiertos: ${open.length}`);
  console.log(`Hallazgos justificados: ${justified.length}`);
  console.log(
    `Excepciones registradas: ${Object.keys(JUSTIFIED_EXCEPTIONS).length}`,
  );

  if (justified.length > 0) {
    console.log("\n--- JUSTIFICADOS ---\n");
    for (const f of justified) {
      console.log(`  [${f.kind}] ${f.route}`);
      console.log(`    ${f.detail}`);
      console.log(`    Motivo: ${f.reason}`);
    }
  }

  if (open.length > 0) {
    console.log("\n--- REQUIEREN REVISIÓN ---\n");
    for (const f of open) {
      console.log(`  [${f.kind}] ${f.route}`);
      console.log(`    ${f.detail}`);
    }
    console.log(
      `\nFallo: ${open.length} hallazgo(s) sin justificación. Añade verificación de pertenencia o documenta en JUSTIFIED_EXCEPTIONS.\n`,
    );
    process.exit(1);
  }

  console.log("\nOK: cero hallazgos no justificados.\n");
  process.exit(0);
}

main();
