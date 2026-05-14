/**
 * Fetch 1 XML per unique Customer Number to extract real receiver RUT
 * + Giro + Dirección + Comuna from the SII-signed DTE.
 *
 * Writes to scripts/zoho-import-data/customer-ruts.json
 */
import fs from "fs";
import { parseString } from "fast-csv";

const FACTURAS_CSV = "/Users/caco/Desktop/Cursor/opai/scripts/zoho-import-data/facturas.csv";
const OUT = "/Users/caco/Desktop/Cursor/opai/scripts/zoho-import-data/customer-ruts.json";

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

function extract(xml, tag) {
  // Try common variants: <Tag>...</Tag>
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

async function main() {
  const rows = await readCsv(FACTURAS_CSV);

  // pick first row per customer that has an XML and is not Void
  const byCustomer = new Map();
  for (const r of rows) {
    const cn = r["Customer Number"];
    if (!cn || r["Invoice Status"] === "Void" || !r["CF.XML"]) continue;
    if (byCustomer.has(cn)) continue;
    byCustomer.set(cn, {
      customerNumber: cn,
      customerName: r["Customer Name"],
      xmlUrl: r["CF.XML"],
      folio: r["CF.Folio"],
      dteType: r["CF.Tipo documento (DTE)"],
    });
  }

  console.log(`Clientes únicos: ${byCustomer.size}`);
  const results = {};

  for (const [cn, info] of byCustomer) {
    process.stdout.write(`  ${cn} (${info.customerName}) folio ${info.folio}... `);
    try {
      const resp = await fetch(info.xmlUrl);
      if (!resp.ok) {
        console.log(`HTTP ${resp.status}`);
        results[cn] = { ...info, error: `HTTP ${resp.status}` };
        continue;
      }
      const xml = await resp.text();
      const rut = extract(xml, "RUTRecep");
      const razon = extract(xml, "RznSocRecep");
      const giro = extract(xml, "GiroRecep");
      const dir = extract(xml, "DirRecep");
      const comuna = extract(xml, "CmnaRecep");
      const ciudad = extract(xml, "CiudadRecep");
      console.log(`${rut} ${razon}`);
      results[cn] = {
        customerNumber: cn,
        customerName: info.customerName,
        rut,
        razonSocial: razon,
        giro,
        direccion: dir,
        comuna,
        ciudad,
        sampleFolio: info.folio,
      };
    } catch (e) {
      console.log(`ERROR ${e.message}`);
      results[cn] = { ...info, error: e.message };
    }
    // small delay to be polite
    await new Promise((r) => setTimeout(r, 100));
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\nGuardado en ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
