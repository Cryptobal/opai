import fs from "fs";
import { parseString } from "fast-csv";

async function readCsv(path) {
  const rows = [];
  const headers = fs.readFileSync(path, "utf-8").split(/\r?\n/)[0].split(",");
  const seen = new Map();
  const dedupHeaders = headers.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}__${n}`;
  });
  return new Promise((resolve, reject) => {
    parseString(fs.readFileSync(path, "utf-8"), { headers: dedupHeaders, renameHeaders: true })
      .on("error", reject)
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve(rows));
  });
}

const facturas = await readCsv("/Users/caco/Desktop/Cursor/opai/scripts/zoho-import-data/facturas.csv");
const ncs = await readCsv("/Users/caco/Desktop/Cursor/opai/scripts/zoho-import-data/notas-credito.csv");

const byInvoice = new Map();
for (const r of facturas) {
  const id = r["Invoice ID"];
  if (!byInvoice.has(id)) byInvoice.set(id, []);
  byInvoice.get(id).push(r);
}

const byStatus = new Map();
const byDteType = new Map();
const byCustomer = new Map();
let withFactoring = 0, voids = 0, withXml = 0;

for (const [, rows] of byInvoice) {
  const f = rows[0];
  byStatus.set(f["Invoice Status"], (byStatus.get(f["Invoice Status"]) ?? 0) + 1);
  byDteType.set(f["CF.Tipo documento (DTE)"], (byDteType.get(f["CF.Tipo documento (DTE)"]) ?? 0) + 1);
  const cn = f["Customer Number"];
  if (!byCustomer.has(cn)) byCustomer.set(cn, { name: f["Customer Name"], count: 0 });
  byCustomer.get(cn).count++;
  if (f["CF.Cedido"] === "Si" || f["CF.Factoring"]) withFactoring++;
  if (f["Invoice Status"] === "Void") voids++;
  if (f["CF.XML"]) withXml++;
}

console.log("=== FACTURAS ===");
console.log(`Filas: ${facturas.length} | Únicas (Invoice ID): ${byInvoice.size}`);
console.log(`Con XML: ${withXml} | Con factoring: ${withFactoring} | Void: ${voids}`);
console.log("\nPor status:");
[...byStatus].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log("\nPor tipo DTE:");
[...byDteType].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k || "(vacío)"}: ${v}`));
console.log("\nClientes (top):");
[...byCustomer].sort((a, b) => b[1].count - a[1].count).forEach(([cn, i]) => console.log(`  ${cn}\t${i.name}\t${i.count}`));

const ncByInvoice = new Map();
for (const r of ncs) {
  const id = r["CreditNotes ID"];
  if (!ncByInvoice.has(id)) ncByInvoice.set(id, []);
  ncByInvoice.get(id).push(r);
}
console.log(`\n=== NC ===\nFilas: ${ncs.length} | Únicas: ${ncByInvoice.size}`);
const ncByStatus = new Map();
for (const [, rows] of ncByInvoice) {
  const s = rows[0]["Credit Note Status"];
  ncByStatus.set(s, (ncByStatus.get(s) ?? 0) + 1);
}
console.log("Por status:");
[...ncByStatus].forEach(([k, v]) => console.log(`  ${k}: ${v}`));

const dates = facturas.map(r => r["Invoice Date"]).filter(Boolean).sort();
console.log(`\nRango fechas facturas: ${dates[0]} → ${dates[dates.length - 1]}`);
