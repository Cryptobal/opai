/**
 * Sandbox cesión — pasos HTTP contra SimpleAPI (Bloque 0).
 *
 * - PASO 1: dte/cesion/generar  → AEC firmado
 * - PASO 2: cesion/enviar       → TrackId del SII
 *
 * Helpers expuestos:
 * - extractDteSummary: lee tipo/folio/receptor/monto del XML del DTE original
 * - buildDocumentoAec: arma el JSON DocumentoAEC esperado por SimpleAPI
 * - step1Generar / step2Enviar: las dos llamadas multipart al API REST
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxArgs } from "./cesion-sandbox-args";

export interface DteSummary {
  tipoDte: number;
  folio: number;
  fechaEmision: string;
  rutReceptor: string;
  montoTotal: number;
}

interface MultipartPart {
  name: string;
  content: string | Buffer;
  contentType?: string;
  filename?: string;
}

function authHeader(apikey: string): string {
  return `Basic ${Buffer.from(`api:${apikey}`).toString("base64")}`;
}

function buildMultipart(parts: MultipartPart[]): {
  body: Buffer;
  contentType: string;
} {
  const boundary = `----opai-sandbox-${Date.now()}`;
  const CRLF = "\r\n";
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}${CRLF}`));
    if (typeof p.content === "string") {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"${CRLF}` +
            `Content-Type: application/json; charset=ISO-8859-1${CRLF}${CRLF}`,
        ),
      );
      chunks.push(Buffer.from(p.content, "latin1"));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"${CRLF}` +
            `Content-Type: ${p.contentType ?? "application/octet-stream"}${CRLF}${CRLF}`,
        ),
      );
      chunks.push(p.content);
    }
    chunks.push(Buffer.from(CRLF));
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export function extractDteSummary(dteText: string): DteSummary {
  const tipoDte = parseInt(dteText.match(/<TipoDTE>(\d+)<\/TipoDTE>/)?.[1] ?? "0", 10);
  const folio = parseInt(dteText.match(/<Folio>(\d+)<\/Folio>/)?.[1] ?? "0", 10);
  const fechaEmision = dteText.match(/<FchEmis>([\d-]+)<\/FchEmis>/)?.[1] ?? "";
  const rutReceptor = dteText.match(/<RUTRecep>([^<]+)<\/RUTRecep>/)?.[1] ?? "";
  const montoTotal = parseInt(
    dteText.match(/<MntTotal>(\d+)<\/MntTotal>/)?.[1] ?? "0",
    10,
  );
  if (!tipoDte || !folio || !fechaEmision || !rutReceptor || !montoTotal) {
    console.error(
      `ERROR: DTE XML incompleto: tipo=${tipoDte} folio=${folio} fecha=${fechaEmision} receptor=${rutReceptor} monto=${montoTotal}`,
    );
    process.exit(1);
  }
  return { tipoDte, folio, fechaEmision, rutReceptor, montoTotal };
}

export function buildDocumentoAec(
  args: SandboxArgs,
  dte: DteSummary,
): Record<string, unknown> {
  return {
    Caratula: {
      RutCedente: args.rutEmisor,
      RutCesionario: args.rutCesionario,
      NombreContacto: "Sandbox Test",
      FonoContacto: "+56912345678",
      MailContacto: args.emailEmisor || "test@opai.cl",
    },
    Cesiones: [
      {
        Secuencia: 1,
        IdentificacionDTE: {
          TipoDTE: dte.tipoDte,
          RUTEmisor: args.rutEmisor,
          RUTReceptor: dte.rutReceptor,
          Folio: dte.folio,
          FechaEmision: dte.fechaEmision,
          MontoTotal: dte.montoTotal,
        },
        Cedente: {
          RUT: args.rutEmisor,
          RazonSocial: args.razonEmisor,
          Direccion: args.direccionEmisor || "Sin direccion",
          eMail: args.emailEmisor || "noreply@opai.cl",
          RUTsAutorizados: [
            { RUT: args.rutTitular, Nombre: "Representante Legal" },
          ],
        },
        Cesionario: {
          RUT: args.rutCesionario,
          RazonSocial: args.razonCesionario,
          Direccion: args.direccionCesionario || "Sin direccion",
          eMail: args.emailCesionario || "noreply@opai.cl",
        },
        MontoCesion: Math.round(args.montoCesion),
        UltimoVencimiento: args.fechaVencimiento,
        OtrasCondiciones: "",
        eMailDeudor: "",
      },
    ],
  };
}

export async function step1Generar(
  args: SandboxArgs,
  pfxBuffer: Buffer,
  dteXmlBuffer: Buffer,
  dte: DteSummary,
): Promise<Buffer> {
  console.log("─".repeat(60));
  console.log("PASO 1: POST /api/v1/dte/cesion/generar");
  console.log("─".repeat(60));

  const generarPayload = {
    DocumentoAEC: buildDocumentoAec(args, dte),
    Certificado: { Rut: args.rutTitular, Password: args.certPwd },
  };
  writeFileSync(
    join(args.outDir, "01-generar-request.json"),
    JSON.stringify(generarPayload, null, 2),
  );

  const generarBody = buildMultipart([
    { name: "input", content: JSON.stringify(generarPayload) },
    {
      name: "file",
      content: pfxBuffer,
      contentType: "application/x-pkcs12",
      filename: "cert.pfx",
    },
    {
      name: "file",
      content: dteXmlBuffer,
      contentType: "application/xml",
      filename: `dte_${dte.folio}.xml`,
    },
  ]);

  const baseUrl = args.baseUrl.replace(/\/$/, "");
  const r = await fetch(`${baseUrl}/api/v1/dte/cesion/generar`, {
    method: "POST",
    headers: {
      Authorization: authHeader(args.apikey),
      "Content-Type": generarBody.contentType,
    },
    body: new Uint8Array(generarBody.body),
  });
  const respBuffer = Buffer.from(await r.arrayBuffer());
  writeFileSync(join(args.outDir, "01-generar-response.bin"), respBuffer);
  if (!r.ok) {
    console.error(
      `❌ HTTP ${r.status}: ${respBuffer.toString("utf8").slice(0, 1000)}`,
    );
    process.exit(1);
  }
  writeFileSync(join(args.outDir, "02-aec.xml"), respBuffer);
  console.log(`✅ AEC generado (${respBuffer.length} bytes): 02-aec.xml`);

  // Validaciones críticas del AEC: estructura básica + presencia de
  // declaración jurada o recibo electrónico (Ley 19.983).
  const aecText = respBuffer.toString("latin1");
  if (!aecText.includes("DocumentoAEC")) {
    console.error("❌ AEC sin <DocumentoAEC>");
    process.exit(1);
  }
  if (!aecText.includes("Signature")) {
    console.error("❌ AEC sin <Signature>");
    process.exit(1);
  }
  const hasReciboElec =
    aecText.includes("<EnvioRecibos>") || aecText.includes("<MnsjRecibo>");
  const hasDeclaracionJurada =
    aecText.includes("DeclaracionJurada") || aecText.includes("<DeclJurada>");
  if (!hasReciboElec && !hasDeclaracionJurada) {
    console.warn("⚠️  AEC NO tiene Recibo Electrónico ni Declaración Jurada.");
    console.warn("   Esto puede romper el mérito ejecutivo (Ley 19.983).");
    console.warn("   Verificar con SimpleAPI cómo incluir la declaración jurada.");
  } else if (hasDeclaracionJurada) {
    console.log("✅ AEC contiene DeclaracionJurada (Ley 19.983)");
  } else {
    console.log("✅ AEC contiene Recibo Electrónico");
  }
  console.log("");
  return respBuffer;
}

export async function step2Enviar(
  args: SandboxArgs,
  aecXmlBuffer: Buffer,
  folio: number,
): Promise<string> {
  console.log("─".repeat(60));
  console.log("PASO 2: POST /api/v1/cesion/enviar");
  console.log("─".repeat(60));

  const ambienteSimpleApi = args.ambiente === "production" ? 1 : 0;
  const enviarPayload = {
    Autenticacion: { Rut: args.rutTitular, Password: args.certPwd },
    CorreoNotificacion: args.emailEmisor || "noreply@opai.cl",
    Ambiente: ambienteSimpleApi,
    Tipo: 5,
  };
  writeFileSync(
    join(args.outDir, "03-enviar-request.json"),
    JSON.stringify(enviarPayload, null, 2),
  );

  const enviarBody = buildMultipart([
    { name: "input", content: JSON.stringify(enviarPayload) },
    {
      name: "files",
      content: aecXmlBuffer,
      contentType: "application/xml",
      filename: `aec_${folio}.xml`,
    },
  ]);

  const baseUrl = args.baseUrl.replace(/\/$/, "");
  const r = await fetch(`${baseUrl}/api/v1/cesion/enviar`, {
    method: "POST",
    headers: {
      Authorization: authHeader(args.apikey),
      "Content-Type": enviarBody.contentType,
      Accept: "application/json",
    },
    body: new Uint8Array(enviarBody.body),
  });
  const respText = await r.text();
  writeFileSync(join(args.outDir, "04-enviar-response.json"), respText);
  if (!r.ok) {
    console.error(`❌ HTTP ${r.status}: ${respText.slice(0, 1000)}`);
    process.exit(1);
  }
  const parsed = JSON.parse(respText) as {
    TrackId?: number | string;
    trackId?: number | string;
    Estado?: string;
  };
  const tid = parsed.TrackId ?? parsed.trackId;
  if (tid === undefined || tid === null || tid === "" || tid === 0) {
    console.error(
      `❌ Sin TrackId. Estado: ${parsed.Estado}. Body: ${respText.slice(0, 500)}`,
    );
    process.exit(1);
  }
  const trackId = String(tid);
  console.log(`✅ TrackId obtenido: ${trackId}`);
  console.log(`   Estado SimpleAPI: ${parsed.Estado ?? "—"}`);
  console.log("");
  return trackId;
}
