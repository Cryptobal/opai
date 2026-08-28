/**
 * Deny-by-default: toda ruta finance y CRM/CPQ con montos debe contener un
 * guard reconocido. Si se agrega un route.ts nuevo sin autorización, este
 * test falla.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Tokens de autorización reconocidos (presencia in-file o en el re-export). */
export const FINANCIAL_ROUTE_GUARD_TOKENS = [
  "hasCapability",
  "hasFacturacionCapability",
  "canView",
  "canEdit",
  "canDelete",
  "ensureModuleAccess",
  "requireFlowV3",
  "hasPermission",
  "requireCrmView",
  "requireCrmEdit",
  "requireCrmDelete",
  "requireCpqView",
  "requireCpqEdit",
  "requireCpqDelete",
  "requireQuoteDelete",
  "ensureCanCreateQuote",
  "resolveApiPerms",
  "hasModuleAccess",
] as const;

const TOKEN_RE = new RegExp(
  `\\b(?:${FINANCIAL_ROUTE_GUARD_TOKENS.join("|")})\\b`,
);

const SCOPES = [
  "src/app/api/finance",
  "src/app/api/crm/deals",
  "src/app/api/crm/quotes",
  "src/app/api/crm/dashboard",
  "src/app/api/crm/leads",
  "src/app/api/cpq/quotes",
];

function collectRouteFiles(dir: string): string[] {
  const abs = path.join(REPO_ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") out.push(full);
    }
  };
  walk(abs);
  return out;
}

function followReexportTarget(source: string): string | null {
  const match = source.match(/from\s+["'](@\/app\/api\/[^"']+)["']/);
  if (!match) return null;
  const rel = match[1].replace(/^@\//, "src/");
  const withoutExt = path.join(REPO_ROOT, rel);
  if (existsSync(`${withoutExt}.ts`)) return `${withoutExt}.ts`;
  if (existsSync(path.join(withoutExt, "route.ts"))) {
    return path.join(withoutExt, "route.ts");
  }
  return existsSync(withoutExt) ? withoutExt : null;
}

function fileHasGuard(filePath: string, seen = new Set<string>()): boolean {
  if (seen.has(filePath)) return false;
  seen.add(filePath);
  const source = readFileSync(filePath, "utf8");
  if (TOKEN_RE.test(source)) return true;
  const target = followReexportTarget(source);
  if (target && target !== filePath) return fileHasGuard(target, seen);
  return false;
}

describe("financial route guards (deny-by-default)", () => {
  const files = SCOPES.flatMap(collectRouteFiles);

  it("encuentra rutas finance y deals/quotes para auditar", () => {
    const finance = collectRouteFiles("src/app/api/finance");
    const deals = collectRouteFiles("src/app/api/crm/deals");
    const cpqQuotes = collectRouteFiles("src/app/api/cpq/quotes");
    expect(finance.length).toBeGreaterThan(10);
    expect(deals.length).toBeGreaterThan(5);
    expect(cpqQuotes.length).toBeGreaterThan(5);
  });

  it("toda ruta finance / deals / quotes declara un guard reconocido", () => {
    const unguarded = files
      .filter((file) => !fileHasGuard(file))
      .map((file) => path.relative(REPO_ROOT, file));
    expect(unguarded, `Sin guard: ${unguarded.join(", ")}`).toEqual([]);
  });
});
