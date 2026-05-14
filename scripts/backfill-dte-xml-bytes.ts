/**
 * Descarga el XML firmado de cada FinanceDte que tenga `xmlUrl` poblado
 * pero no tenga `dteXml` (bytes) en BD, valida que coincida con el DTE
 * (tipoDte/folio/RUTs/total ±$1) y lo persiste en `dteXml`.
 *
 * Esto hace que la UI deje de mostrar el botón "Subir XML" para esas
 * facturas — la condición de visibilidad es `!dte.hasXml` que se calcula
 * desde `dteXml`, no desde `xmlUrl`.
 *
 * Uso:
 *   npx tsx scripts/backfill-dte-xml-bytes.ts                 # dry-run
 *   npx tsx scripts/backfill-dte-xml-bytes.ts --apply         # ejecuta
 *   npx tsx scripts/backfill-dte-xml-bytes.ts --apply --concurrency=8
 *
 * Carga `.env.local` si existe.
 */

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { PrismaClient } from "@prisma/client";
import { extractDteIdentity } from "@/lib/dte-xml-parser";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg ? Math.max(1, Math.min(16, Number(concurrencyArg.slice("--concurrency=".length)))) : 6;

function normalizeRut(r: string | null | undefined): string {
  return (r ?? "").replace(/[.\-\s]/g, "").toUpperCase();
}

type Job = {
  id: string;
  code: string;
  dteType: number;
  folio: number;
  issuerRut: string;
  receiverRut: string;
  totalAmount: number;
  xmlUrl: string;
};

async function processOne(job: Job): Promise<{
  status: "ok" | "mismatch" | "fetch_error" | "parse_error";
  detail?: string;
  bytes?: number;
}> {
  let xml: string;
  try {
    const resp = await fetch(job.xmlUrl);
    if (!resp.ok) return { status: "fetch_error", detail: `HTTP ${resp.status}` };
    xml = await resp.text();
    if (!xml.trim()) return { status: "fetch_error", detail: "XML vacío" };
  } catch (e) {
    return { status: "fetch_error", detail: (e as Error).message };
  }

  let identity;
  try {
    identity = extractDteIdentity(Buffer.from(xml, "utf-8"));
  } catch (e) {
    return { status: "parse_error", detail: (e as Error).message };
  }

  const mismatches: string[] = [];
  if (identity.tipoDte !== job.dteType) {
    mismatches.push(`tipo(${identity.tipoDte}≠${job.dteType})`);
  }
  if (identity.folio !== job.folio) {
    mismatches.push(`folio(${identity.folio}≠${job.folio})`);
  }
  if (normalizeRut(identity.rutEmisor) !== normalizeRut(job.issuerRut)) {
    mismatches.push(`emisor(${identity.rutEmisor}≠${job.issuerRut})`);
  }
  if (normalizeRut(identity.rutReceptor) !== normalizeRut(job.receiverRut)) {
    mismatches.push(`receptor(${identity.rutReceptor}≠${job.receiverRut})`);
  }
  const diff = Math.abs(identity.total - job.totalAmount);
  if (diff > 1) {
    mismatches.push(`total($${identity.total}≠$${job.totalAmount}, Δ=${diff})`);
  }

  if (mismatches.length > 0) {
    return { status: "mismatch", detail: mismatches.join(", ") };
  }

  if (APPLY) {
    await prisma.financeDte.update({
      where: { id: job.id },
      data: { dteXml: new Uint8Array(Buffer.from(xml, "utf-8")) },
    });
  }

  return { status: "ok", bytes: xml.length };
}

async function runWithConcurrency<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"} | concurrency=${CONCURRENCY}`);

  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  if (!tenant) throw new Error("tenant gard no encontrado");

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId: tenant.id,
      direction: "ISSUED",
      xmlUrl: { not: null },
      dteXml: null,
    },
    select: {
      id: true,
      code: true,
      dteType: true,
      folio: true,
      issuerRut: true,
      receiverRut: true,
      totalAmount: true,
      xmlUrl: true,
    },
    orderBy: [{ dteType: "asc" }, { folio: "asc" }],
  });

  const jobs: Job[] = dtes.map((d) => ({
    id: d.id,
    code: d.code,
    dteType: d.dteType,
    folio: d.folio,
    issuerRut: d.issuerRut,
    receiverRut: d.receiverRut,
    totalAmount: Number(d.totalAmount),
    xmlUrl: d.xmlUrl!,
  }));

  console.log(`DTEs a procesar: ${jobs.length}`);

  let ok = 0;
  let mismatch = 0;
  let fetchErr = 0;
  let parseErr = 0;
  const issues: string[] = [];

  const results = await runWithConcurrency(jobs, CONCURRENCY, async (j) => {
    const r = await processOne(j);
    if (r.status === "ok") {
      ok++;
      if (ok % 50 === 0) process.stdout.write(`  ok=${ok}\n`);
    } else if (r.status === "mismatch") {
      mismatch++;
      issues.push(`  [mismatch] ${j.code} folio=${j.folio}: ${r.detail}`);
    } else if (r.status === "fetch_error") {
      fetchErr++;
      issues.push(`  [fetch_error] ${j.code} folio=${j.folio}: ${r.detail}`);
    } else {
      parseErr++;
      issues.push(`  [parse_error] ${j.code} folio=${j.folio}: ${r.detail}`);
    }
    return r;
  });

  if (issues.length > 0) {
    console.log("\n--- problemas ---");
    issues.slice(0, 40).forEach((s) => console.log(s));
    if (issues.length > 40) console.log(`  ... y ${issues.length - 40} más`);
  }

  console.log("\n=== RESUMEN ===");
  console.log(`OK:           ${ok}`);
  console.log(`Mismatch:     ${mismatch}`);
  console.log(`Fetch error:  ${fetchErr}`);
  console.log(`Parse error:  ${parseErr}`);
  if (!APPLY) console.log("\n[DRY-RUN] No se escribió. Usar --apply.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
