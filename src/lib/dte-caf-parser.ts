/**
 * CAF (Código de Autorización de Folios) XML parser.
 *
 * El CAF es un XML emitido por el SII al solicitar timbraje.
 * Estructura simplificada:
 *   <AUTORIZACION>
 *     <CAF version="1.0">
 *       <DA>
 *         <RE>12345678-9</RE>       <!-- RUT emisor (placeholder) -->
 *         <RS>RAZON SOCIAL</RS>
 *         <TD>33</TD>               <!-- Tipo DTE -->
 *         <RNG>
 *           <D>1</D>                <!-- Folio desde -->
 *           <H>100</H>              <!-- Folio hasta -->
 *         </RNG>
 *         <FA>2025-01-15</FA>       <!-- Fecha autorización -->
 *         ...
 *       </DA>
 *       ...
 *     </CAF>
 *     ...
 *   </AUTORIZACION>
 *
 * IMPORTANT: el XML completo NO debe modificarse — perdería validez ante SII.
 * Esta función solo lee metadata; el archivo se almacena tal cual en TenantDteCaf.xmlData.
 */

import { XMLParser } from "fast-xml-parser";

export interface CafMetadata {
  rutEmisor: string;        // formato "12345678-9"
  razonSocial: string;
  dteType: number;          // 33, 34, 39, 56, 61
  folioDesde: number;
  folioHasta: number;
  fechaAutorizacion: Date;  // FA del CAF
}

export class CafParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CafParseError";
  }
}

export function parseCaf(xmlBuffer: Buffer): CafMetadata {
  const xml = xmlBuffer.toString("utf-8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
  });

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    throw new CafParseError("XML del CAF es inválido o malformado.");
  }

  const da = parsed?.AUTORIZACION?.CAF?.DA;
  if (!da) {
    throw new CafParseError(
      "El XML no tiene la estructura AUTORIZACION/CAF/DA esperada de un CAF SII."
    );
  }

  const re = String(da.RE ?? "").trim();
  const rs = String(da.RS ?? "").trim();
  const td = parseInt(String(da.TD ?? ""), 10);
  const fd = parseInt(String(da?.RNG?.D ?? ""), 10);
  const fh = parseInt(String(da?.RNG?.H ?? ""), 10);
  const fa = String(da.FA ?? "").trim();

  if (!re || !/^\d{1,8}-[\dKk]$/.test(re)) {
    throw new CafParseError(`RUT emisor inválido en CAF: "${re}"`);
  }
  if (!Number.isInteger(td) || ![33, 34, 39, 52, 56, 61].includes(td)) {
    throw new CafParseError(`Tipo DTE inválido en CAF: ${td}`);
  }
  if (!Number.isInteger(fd) || !Number.isInteger(fh) || fd > fh || fd < 1) {
    throw new CafParseError(
      `Rango de folios inválido en CAF: desde=${fd}, hasta=${fh}`
    );
  }
  const fechaAutorizacion = new Date(fa);
  if (isNaN(fechaAutorizacion.getTime())) {
    throw new CafParseError(`Fecha autorización inválida: "${fa}"`);
  }

  return {
    rutEmisor: re.toUpperCase(),
    razonSocial: rs,
    dteType: td,
    folioDesde: fd,
    folioHasta: fh,
    fechaAutorizacion,
  };
}
