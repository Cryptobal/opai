/**
 * Fix RUTs in customer-ruts.json — the original regex was case-insensitive
 * and matched <RutReceptor> (SII envelope) instead of <RUTRecep> (invoice).
 *
 * Use case-sensitive matching here.
 */
import fs from "fs";
const OUT = "/Users/caco/Desktop/Cursor/opai/scripts/zoho-import-data/customer-ruts.json";

const data = JSON.parse(fs.readFileSync(OUT, "utf-8"));

// We need to re-fetch only when rut is malformed. But the other fields are correct,
// so the XMLs are already cached server-side. Just re-extract from the original
// pattern: <RUTRecep>VALUE</RUTRecep> (case-sensitive)

function extract(xml, tag) {
  // case-sensitive
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

// Get XMLs from URLs that I have on hand. Since the JSON only has cleaned data,
// I need to fetch again, but only this time use proper regex.
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

// pick first XML per customer
const xmlByCustomer = new Map();
for (const r of facturas) {
  const cn = r["Customer Number"];
  if (!cn || r["Invoice Status"] === "Void" || !r["CF.XML"]) continue;
  if (xmlByCustomer.has(cn)) continue;
  xmlByCustomer.set(cn, r["CF.XML"]);
}

const fixed = {};
for (const [cn, url] of xmlByCustomer) {
  process.stdout.write(`  ${cn}... `);
  try {
    const xml = await (await fetch(url)).text();
    const rut = extract(xml, "RUTRecep");
    fixed[cn] = { ...(data[cn] ?? {}), rut, customerNumber: cn };
    // also re-extract razon (case-sensitive)
    const razon = extract(xml, "RznSocRecep");
    const giro = extract(xml, "GiroRecep");
    const dir = extract(xml, "DirRecep");
    const comuna = extract(xml, "CmnaRecep");
    const ciudad = extract(xml, "CiudadRecep");
    if (razon) fixed[cn].razonSocial = razon;
    if (giro) fixed[cn].giro = giro;
    if (dir) fixed[cn].direccion = dir;
    if (comuna) fixed[cn].comuna = comuna;
    if (ciudad) fixed[cn].ciudad = ciudad;
    console.log(`${rut}\t${razon}`);
  } catch (e) {
    console.log(`ERROR ${e.message}`);
    fixed[cn] = data[cn];
  }
  await new Promise((r) => setTimeout(r, 80));
}

fs.writeFileSync(OUT, JSON.stringify(fixed, null, 2));
console.log("Fixed.");
