/**
 * Imprime las credenciales de Web4Leads para un tenant (URL + Secret).
 * Estas dos son las que se entregan a Web4Leads. El MASTER nunca se comparte.
 *
 * Uso: npx tsx scripts/web4leads-credentials.ts <tenantSlug>
 * Ej:  npx tsx scripts/web4leads-credentials.ts gard
 *
 * Requiere WEB4LEADS_MASTER_SECRET en el entorno (`vercel env pull` antes).
 */
import { PrismaClient } from "@prisma/client";
import {
  tenantWeb4leadsKey,
  tenantWeb4leadsSecret,
} from "../src/modules/finance/banking/web4leads-inbox";
import { getCanonicalSiteUrl } from "../src/lib/emails/site-url";

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Uso: npx tsx scripts/web4leads-credentials.ts <tenantSlug>");
    process.exit(1);
  }
  if (!process.env.WEB4LEADS_MASTER_SECRET) {
    console.error(
      "Falta WEB4LEADS_MASTER_SECRET (corre `vercel env pull` primero).",
    );
    process.exit(1);
  }
  const t = await prisma.tenant.findFirst({ where: { slug } });
  if (!t) {
    console.error(`Tenant "${slug}" no encontrado.`);
    process.exit(1);
  }
  const key = tenantWeb4leadsKey(t.id);
  const secret = tenantWeb4leadsSecret(t.id);
  const base = getCanonicalSiteUrl();

  console.log("");
  console.log(
    "=== Credenciales Web4Leads — ENTREGAR estas dos a Web4Leads ===",
  );
  console.log(`Tenant:  ${slug} (${t.id})`);
  console.log(`URL:     ${base}/api/inbound/web4leads/${key}`);
  console.log(`Secret:  ${secret}`);
  console.log("");
  console.log(
    "NO compartir WEB4LEADS_MASTER_SECRET. Entregar por canal seguro.",
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
