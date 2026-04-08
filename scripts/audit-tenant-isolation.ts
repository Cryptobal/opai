// Ejecutar con: npx tsx scripts/audit-tenant-isolation.ts
import * as fs from 'fs';
import * as path from 'path';

const API_DIR = path.join(process.cwd(), 'src/app/api');
const TENANT_PATTERNS = [
  'tenantId', 'tenant_id', 'getTenant', 'requireTenant',
  'session.user.tenantId', 'session?.user?.tenantId',
];
const EXEMPT_PREFIXES = [
  'api/auth', 'api/public', 'api/cron', 'api/webhook',
  'api/fx/', 'api/email-preview', 'api/test',
  'api/platform', 'api/health',
];

function scanDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath));
    } else if (entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

const routes = scanDir(API_DIR);
const issues: { route: string; exempt: boolean; reason: string }[] = [];

for (const route of routes) {
  const content = fs.readFileSync(route, 'utf-8');
  const relativePath = path.relative(process.cwd(), route);
  const hasTenantCheck = TENANT_PATTERNS.some(p => content.includes(p));

  if (!hasTenantCheck) {
    const isExempt = EXEMPT_PREFIXES.some(prefix =>
      relativePath.includes(prefix.replace(/\//g, path.sep))
    );
    issues.push({
      route: relativePath,
      exempt: isExempt,
      reason: isExempt ? 'Ruta pública/cron/webhook (OK)' : 'REVISAR: Sin verificación de tenant',
    });
  }
}

const needsReview = issues.filter(i => !i.exempt);
const exempted = issues.filter(i => i.exempt);

console.log(`\n=== AUDIT DE AISLAMIENTO MULTITENANT ===`);
console.log(`Total rutas API: ${routes.length}`);
console.log(`Rutas con tenant check: ${routes.length - issues.length}`);
console.log(`Rutas sin tenant check: ${issues.length}`);
console.log(`  - Exentas (públicas/cron/webhook): ${exempted.length}`);
console.log(`  - REQUIEREN REVISIÓN: ${needsReview.length}`);
console.log(`\n--- RUTAS QUE REQUIEREN REVISIÓN ---\n`);
needsReview.forEach(i => console.log(`  ${i.route}`));

const report = {
  date: new Date().toISOString(),
  summary: {
    totalRoutes: routes.length,
    withTenantCheck: routes.length - issues.length,
    withoutTenantCheck: issues.length,
    exempt: exempted.length,
    needsReview: needsReview.length,
  },
  needsReview: needsReview.map(i => i.route),
  exempt: exempted.map(i => i.route),
};
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/audit-tenant-isolation-report.json', JSON.stringify(report, null, 2));
console.log(`\nReporte guardado en docs/audit-tenant-isolation-report.json`);
