/**
 * Sandbox cesión — parsing de argumentos CLI (Bloque 0).
 *
 * Maneja la lectura de flags + env vars y devuelve un objeto SandboxArgs
 * tipado para el resto del flujo. Si falta algo obligatorio, mata el
 * proceso con código 1 y mensaje claro.
 *
 * Modos soportados:
 *   - FULL (default): genera AEC + envía + consulta estado SII.
 *     Requiere todos los campos del cedente/cesionario y un DTE XML.
 *   - CHECK-ONLY (--check-only): solo consulta el estado SOAP de un
 *     TrackId existente. Read-only, no modifica nada en SII. Sólo
 *     requiere cert + rut-titular + track-id.
 */

import { parseArgs } from "node:util";

export interface SandboxArgs {
  apikey: string;
  baseUrl: string;
  cert: string;
  certPwd: string;
  rutTitular: string;
  dteXml: string;
  rutEmisor: string;
  razonEmisor: string;
  direccionEmisor: string;
  emailEmisor: string;
  rutCesionario: string;
  razonCesionario: string;
  direccionCesionario: string;
  emailCesionario: string;
  montoCesion: number;
  fechaVencimiento: string;
  ambiente: "certification" | "production";
  outDir: string;
  /** Si true, salta pasos 1-2 (SimpleAPI) y solo corre SOAP getEstEnvio. */
  checkOnly: boolean;
  /** TrackId pre-existente a consultar en modo check-only. */
  trackId: string;
}

function die(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

export function parseArguments(): SandboxArgs {
  const { values } = parseArgs({
    options: {
      cert: { type: "string" },
      "cert-pwd": { type: "string" },
      "rut-titular": { type: "string" },
      "dte-xml": { type: "string", default: "" },
      "rut-emisor": { type: "string", default: "" },
      "razon-emisor": { type: "string", default: "" },
      "direccion-emisor": { type: "string", default: "" },
      "email-emisor": { type: "string", default: "" },
      "rut-cesionario": { type: "string", default: "" },
      "razon-cesionario": { type: "string", default: "" },
      "direccion-cesionario": { type: "string", default: "" },
      "email-cesionario": { type: "string", default: "" },
      "monto-cesion": { type: "string", default: "" },
      "fecha-vencimiento": { type: "string", default: "" },
      ambiente: { type: "string", default: "certification" },
      "base-url": { type: "string", default: "https://api.simpleapi.cl" },
      "out-dir": { type: "string", default: "./tmp/sandbox-cesion" },
      "check-only": { type: "boolean", default: false },
      "track-id": { type: "string", default: "" },
    },
    strict: true,
    allowPositionals: false,
  });

  const checkOnly = Boolean(values["check-only"]);
  const apikey = process.env.SIMPLEAPI_KEY ?? "";
  // SIMPLEAPI_KEY solo es necesaria en modo FULL (pasos 1-2).
  if (!checkOnly && !apikey) die("Falta env var SIMPLEAPI_KEY");

  // Campos siempre obligatorios (cualquier modo).
  const baseRequired = [
    ["cert", values.cert],
    ["cert-pwd", values["cert-pwd"]],
    ["rut-titular", values["rut-titular"]],
  ] as const;
  for (const [name, val] of baseRequired) {
    if (!val) die(`Falta argumento obligatorio --${name}`);
  }

  if (checkOnly) {
    if (!values["track-id"]) {
      die("Modo --check-only requiere --track-id");
    }
  } else {
    const fullRequired = [
      ["dte-xml", values["dte-xml"]],
      ["rut-emisor", values["rut-emisor"]],
      ["razon-emisor", values["razon-emisor"]],
      ["rut-cesionario", values["rut-cesionario"]],
      ["razon-cesionario", values["razon-cesionario"]],
      ["monto-cesion", values["monto-cesion"]],
      ["fecha-vencimiento", values["fecha-vencimiento"]],
    ] as const;
    for (const [name, val] of fullRequired) {
      if (!val) die(`Falta argumento obligatorio --${name}`);
    }
  }

  // Validación específica del monto (solo en modo FULL).
  let montoCesion = 0;
  if (!checkOnly) {
    const monto = Number(values["monto-cesion"]);
    if (!Number.isFinite(monto) || monto <= 0) {
      die(`--monto-cesion debe ser número positivo (recibí "${values["monto-cesion"]}")`);
    }
    montoCesion = monto;
  }
  const ambiente = values.ambiente === "production" ? "production" : "certification";

  return {
    apikey,
    baseUrl: String(values["base-url"]),
    cert: String(values.cert),
    certPwd: String(values["cert-pwd"]),
    rutTitular: String(values["rut-titular"]),
    dteXml: String(values["dte-xml"] ?? ""),
    rutEmisor: String(values["rut-emisor"] ?? ""),
    razonEmisor: String(values["razon-emisor"] ?? ""),
    direccionEmisor: String(values["direccion-emisor"] ?? ""),
    emailEmisor: String(values["email-emisor"] ?? ""),
    rutCesionario: String(values["rut-cesionario"] ?? ""),
    razonCesionario: String(values["razon-cesionario"] ?? ""),
    direccionCesionario: String(values["direccion-cesionario"] ?? ""),
    emailCesionario: String(values["email-cesionario"] ?? ""),
    montoCesion,
    fechaVencimiento: String(values["fecha-vencimiento"] ?? ""),
    ambiente,
    outDir: String(values["out-dir"]),
    checkOnly,
    trackId: String(values["track-id"] ?? ""),
  };
}
