/**
 * Smoke test del endpoint Web4Leads. NO escribe movimientos:
 *   1) KEY falsa                          → 200 tenant_not_found
 *   2) KEY real + firma inválida          → 401
 *   3) KEY real + firma OK + cuenta falsa → 200 bank_account_not_found
 *      (efecto lateral esperado: 1 notificación campana al admin)
 *
 * Uso: npx tsx scripts/web4leads-smoke.ts <baseUrl> <tenantSlug>
 * Ej:  npx tsx scripts/web4leads-smoke.ts http://localhost:3000 gard
 *      npx tsx scripts/web4leads-smoke.ts https://www.opai.cl gard
 */
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  tenantWeb4leadsKey,
  tenantWeb4leadsSecret,
} from "../src/modules/finance/banking/web4leads-inbox";

function sign(secret: string, body: string, ts: string): string {
  return crypto.createHmac("sha256", secret).update(body + ts).digest("hex");
}

async function post(url: string, body: string, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* body no-JSON */
  }
  return { status: res.status, json };
}

async function main() {
  const [base, slug] = process.argv.slice(2);
  if (!base || !slug) {
    console.error("Uso: npx tsx scripts/web4leads-smoke.ts <baseUrl> <tenantSlug>");
    process.exit(1);
  }
  if (!process.env.WEB4LEADS_MASTER_SECRET) {
    console.error("Falta WEB4LEADS_MASTER_SECRET en el entorno (.env.local).");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const t = await prisma.tenant.findFirst({ where: { slug } });
  await prisma.$disconnect();
  if (!t) {
    console.error(`Tenant "${slug}" no encontrado.`);
    process.exit(1);
  }
  const key = tenantWeb4leadsKey(t.id);
  const secret = tenantWeb4leadsSecret(t.id)!;
  const body = JSON.stringify({
    accountNumber: "999999999999",
    bankCode: "SMOKE_TEST",
    movements: [
      {
        externalId: `smoke-${Date.now()}`,
        transactionDate: "2026-01-01",
        description: "SMOKE TEST WEB4LEADS — IGNORAR",
        amount: 1,
      },
    ],
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  let allPass = true;

  const r1 = await post(`${base}/api/inbound/web4leads/000000000000`, body, {
    "x-web4leads-timestamp": ts,
    "x-web4leads-signature": sign(secret, body, ts),
  });
  const ok1 =
    r1.status === 200 &&
    (r1.json as { skipped?: string } | null)?.skipped === "tenant_not_found";
  console.log(`${ok1 ? "PASS" : "FAIL"} [1] key falsa → ${r1.status} ${JSON.stringify(r1.json)}`);
  allPass = allPass && ok1;

  const r2 = await post(`${base}/api/inbound/web4leads/${key}`, body, {
    "x-web4leads-timestamp": ts,
    "x-web4leads-signature": "0".repeat(64),
  });
  const ok2 = r2.status === 401;
  console.log(`${ok2 ? "PASS" : "FAIL"} [2] firma inválida → ${r2.status}`);
  allPass = allPass && ok2;

  const r3 = await post(`${base}/api/inbound/web4leads/${key}`, body, {
    "x-web4leads-timestamp": ts,
    "x-web4leads-signature": sign(secret, body, ts),
  });
  const ok3 =
    r3.status === 200 &&
    (r3.json as { skipped?: string } | null)?.skipped === "bank_account_not_found";
  console.log(`${ok3 ? "PASS" : "FAIL"} [3] firma OK + cuenta falsa → ${r3.status} ${JSON.stringify(r3.json)}`);
  allPass = allPass && ok3;

  console.log(allPass ? "\nSMOKE OK — endpoint operativo (auth + parsing + tenant + cuenta)." : "\nSMOKE FAILED");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
