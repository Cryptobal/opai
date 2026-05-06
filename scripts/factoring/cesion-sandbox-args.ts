/**
 * Sandbox cesión — parsing de argumentos CLI (Bloque 0).
 *
 * Maneja la lectura de flags + env vars y devuelve un objeto SandboxArgs
 * tipado para el resto del flujo. Si falta algo obligatorio, mata el
 * proceso con código 1 y mensaje claro.
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
      "dte-xml": { type: "string" },
      "rut-emisor": { type: "string" },
      "razon-emisor": { type: "string" },
      "direccion-emisor": { type: "string", default: "" },
      "email-emisor": { type: "string", default: "" },
      "rut-cesionario": { type: "string" },
      "razon-cesionario": { type: "string" },
      "direccion-cesionario": { type: "string", default: "" },
      "email-cesionario": { type: "string", default: "" },
      "monto-cesion": { type: "string" },
      "fecha-vencimiento": { type: "string" },
      ambiente: { type: "string", default: "certification" },
      "base-url": { type: "string", default: "https://api.simpleapi.cl" },
      "out-dir": { type: "string", default: "./tmp/sandbox-cesion" },
    },
    strict: true,
    allowPositionals: false,
  });

  const apikey = process.env.SIMPLEAPI_KEY ?? "";
  if (!apikey) die("Falta env var SIMPLEAPI_KEY");

  const required = [
    ["cert", values.cert],
    ["cert-pwd", values["cert-pwd"]],
    ["rut-titular", values["rut-titular"]],
    ["dte-xml", values["dte-xml"]],
    ["rut-emisor", values["rut-emisor"]],
    ["razon-emisor", values["razon-emisor"]],
    ["rut-cesionario", values["rut-cesionario"]],
    ["razon-cesionario", values["razon-cesionario"]],
    ["monto-cesion", values["monto-cesion"]],
    ["fecha-vencimiento", values["fecha-vencimiento"]],
  ] as const;
  for (const [name, val] of required) {
    if (!val) die(`Falta argumento obligatorio --${name}`);
  }

  const monto = Number(values["monto-cesion"]);
  if (!Number.isFinite(monto) || monto <= 0) {
    die(`--monto-cesion debe ser número positivo (recibí "${values["monto-cesion"]}")`);
  }
  const ambiente = values.ambiente === "production" ? "production" : "certification";

  return {
    apikey,
    baseUrl: String(values["base-url"]),
    cert: String(values.cert),
    certPwd: String(values["cert-pwd"]),
    rutTitular: String(values["rut-titular"]),
    dteXml: String(values["dte-xml"]),
    rutEmisor: String(values["rut-emisor"]),
    razonEmisor: String(values["razon-emisor"]),
    direccionEmisor: String(values["direccion-emisor"] ?? ""),
    emailEmisor: String(values["email-emisor"] ?? ""),
    rutCesionario: String(values["rut-cesionario"]),
    razonCesionario: String(values["razon-cesionario"]),
    direccionCesionario: String(values["direccion-cesionario"] ?? ""),
    emailCesionario: String(values["email-cesionario"] ?? ""),
    montoCesion: monto,
    fechaVencimiento: String(values["fecha-vencimiento"]),
    ambiente,
    outDir: String(values["out-dir"]),
  };
}
