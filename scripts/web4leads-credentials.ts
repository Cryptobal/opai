/**
 * Genera el documento de entrega para Web4Leads de un tenant, rellenando la
 * plantilla docs/integraciones/web4leads-proveedor.md con URL + Secret reales.
 *
 * El archivo de salida (WEB4LEADS_ENTREGA_<slug>.md) está en .gitignore y
 * NUNCA debe commitearse. El secret no se imprime en consola.
 *
 * Uso: npx tsx scripts/web4leads-credentials.ts <tenantSlug>
 * Ej:  npx tsx scripts/web4leads-credentials.ts gard
 *
 * Requiere WEB4LEADS_MASTER_SECRET en el entorno (.env.local).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
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
    console.error("Falta WEB4LEADS_MASTER_SECRET en el entorno (.env.local).");
    process.exit(1);
  }
  const t = await prisma.tenant.findFirst({ where: { slug } });
  if (!t) {
    console.error(`Tenant "${slug}" no encontrado.`);
    process.exit(1);
  }
  const key = tenantWeb4leadsKey(t.id);
  const secret = tenantWeb4leadsSecret(t.id)!;
  const url = `${getCanonicalSiteUrl()}/api/inbound/web4leads/${key}`;

  const template = readFileSync("docs/integraciones/web4leads-proveedor.md", "utf8");
  const filled = template.split("{{URL}}").join(url).split("{{SECRET}}").join(secret);
  const outFile = `WEB4LEADS_ENTREGA_${slug}.md`;
  writeFileSync(outFile, filled, "utf8");

  console.log(`Documento de entrega generado: ${outFile}`);
  console.log(`URL del endpoint: ${url}`);
  console.log("El Secret está DENTRO del documento (no se imprime aquí).");
  console.log("Enviar el documento a Web4Leads por canal seguro y NO commitearlo.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
