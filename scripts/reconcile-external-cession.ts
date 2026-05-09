import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { reconcileExternalCession } from "../src/modules/finance/factoring/external-cession-reconciliation";
import { prisma } from "../src/lib/prisma";

config({ path: ".env.local", override: false });
if (process.env.DIRECT_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
}

const { values } = parseArgs({
  options: {
    "tenant-id": { type: "string" },
    "dte-type": { type: "string" },
    folio: { type: "string" },
    "cesionario-rut": { type: "string" },
    "cesionario-razon-social": { type: "string" },
    "cesionario-direccion": { type: "string" },
    "cesionario-email": { type: "string" },
    "fecha-cesion": { type: "string" },
    "fecha-vencimiento": { type: "string" },
    "monto-cesion": { type: "string" },
    "aec-track-id": { type: "string" },
    "sii-status": { type: "string" },
    "dte-xml": { type: "string" },
    "aec-xml": { type: "string" },
    "created-by": { type: "string" },
    notes: { type: "string" },
    evidence: { type: "string" },
  },
});

function required(name: keyof typeof values): string {
  const value = values[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Falta --${name}`);
  }
  return value;
}

function optionalBuffer(path: string | undefined): Buffer | undefined {
  return path ? readFileSync(path) : undefined;
}

async function main() {
  const dteType = Number(required("dte-type"));
  const folio = Number(required("folio"));
  const montoCesionRaw = values["monto-cesion"];
  const evidenceRaw = values.evidence;

  if (!Number.isInteger(dteType) || !Number.isInteger(folio)) {
    throw new Error("--dte-type y --folio deben ser enteros.");
  }

  const result = await reconcileExternalCession({
    tenantId: required("tenant-id"),
    dteType,
    folio,
    cesionarioRut: required("cesionario-rut"),
    cesionarioRazonSocial: required("cesionario-razon-social"),
    cesionarioDireccion: values["cesionario-direccion"] ?? null,
    cesionarioEmail: values["cesionario-email"] ?? null,
    fechaCesion: required("fecha-cesion"),
    fechaVencimiento: required("fecha-vencimiento"),
    montoCesion:
      typeof montoCesionRaw === "string" ? Number(montoCesionRaw) : undefined,
    aecTrackId: values["aec-track-id"] ?? null,
    cessionSiiStatus: values["sii-status"] ?? "EOK",
    dteXml: optionalBuffer(values["dte-xml"]),
    aecXml: optionalBuffer(values["aec-xml"]),
    createdBy: values["created-by"] ?? "system:external-reconciliation",
    notes: values.notes ?? null,
    evidence: evidenceRaw ? JSON.parse(evidenceRaw) : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
