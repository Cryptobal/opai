import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walkRouteFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

// Endpoints that are public or handle login themselves — no auth required.
const AUTH_EXEMPT = new Set([
  "src/app/api/portal/cliente/auth/route.ts",
  "src/app/api/portal/cliente/auth/google/route.ts",
  "src/app/api/portal/cliente/auth/google/callback/route.ts",
  "src/app/api/portal/cliente/auth/magic/route.ts",
  "src/app/api/portal/cliente/logout/route.ts",
  "src/app/api/portal/cliente/setup/route.ts",
  "src/app/api/portal/cliente/forgot-pin/route.ts",
  "src/app/api/portal/cliente/contrato/[token]/route.ts",
  "src/app/api/portal/cliente/contrato/[token]/accept/route.ts",
  "src/app/api/portal/cliente/presentation-view/route.ts",
  "src/app/api/portal/cliente/cotizaciones/[id]/view/route.ts",
  // Admin-authenticated endpoint (reads audit logs via JWT, not portal cookie)
  "src/app/api/portal/cliente/audit/route.ts",
]);

function main() {
  const baseDir = "src/app/api/portal/cliente";
  const files = walkRouteFiles(baseDir);
  const issues = [];

  for (const f of files) {
    const src = readFileSync(f, "utf-8");
    const normalized = f.replace(/\\/g, "/");

    // Rule 1: must NOT use getClientSession (insecure header-based auth)
    if (src.includes("getClientSession")) {
      issues.push(`${f}: still uses getClientSession (INSECURE)`);
    }

    // Rule 2: must NOT read x-tenant-id/x-account-id/x-contact-id from headers
    if (
      src.includes('headers.get("x-tenant-id")') ||
      src.includes('headers.get("x-account-id")') ||
      src.includes('headers.get("x-contact-id")')
    ) {
      issues.push(`${f}: still reads x-* headers directly (INSECURE)`);
    }

    // Rule 3: non-exempt endpoints must resolve identity from the cookie.
    if (!AUTH_EXEMPT.has(normalized)) {
      const usesCookieAuth =
        src.includes("requirePortalClienteAuth") ||
        src.includes("parsePortalClienteSessionCookie");
      if (!usesCookieAuth) {
        issues.push(
          `${f}: missing cookie-based auth (requirePortalClienteAuth or parsePortalClienteSessionCookie)`,
        );
      }
    }
  }

  if (issues.length) {
    console.error(
      "❌ Auth audit failed:\n" + issues.map((i) => "  - " + i).join("\n"),
    );
    process.exit(1);
  }
  console.log(`✅ Auth audit passed: ${files.length} endpoints`);
}

main();
