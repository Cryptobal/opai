/**
 * Parser del XML firmado de un DTE chileno (formato SII).
 *
 * Extrae los datos necesarios para renderizar la representación
 * impresa (PDF) localmente sin depender del proveedor (SimpleAPI).
 *
 * El XML del DTE se compone de:
 *   <DTE>
 *     <Documento ID="...">
 *       <Encabezado>
 *         <IdDoc>            (TipoDTE, Folio, FchEmis, FmaPago, etc.)
 *         <Emisor>           (RUT, razón social, giro, dirección, etc.)
 *         <Receptor>         (RUT, razón social, dirección, etc.)
 *         <Totales>          (MntNeto, IVA, MntExe, MntTotal, etc.)
 *       </Encabezado>
 *       <Detalle>            (1..N — items facturados)
 *       <Referencia>         (0..N — DTEs/OCs referenciados)
 *       <TED version="1.0">  (Timbre Electrónico para PDF417)
 *       <TmstFirma>          (timestamp de firma)
 *     </Documento>
 *     <Signature>            (firma XMLDSig)
 *   </DTE>
 *
 * Esta función NO valida la firma — solo extrae los datos. La validez
 * legal del DTE ya está garantizada porque el XML viene firmado por
 * SimpleAPI con el certificado del emisor (ver dte-issuer.service.ts).
 */

import { XMLParser } from "fast-xml-parser";

export interface DteParsed {
  documentId: string;

  /** Tipo SII: 33, 34, 39, 41, 43, 52, 56, 61. */
  tipoDte: number;
  folio: number;
  /** Fecha emisión en formato YYYY-MM-DD. */
  fechaEmision: string;
  /** Forma de pago si está declarada (1=Contado, 2=Crédito). */
  formaPago: number | null;
  /** Vencimiento en YYYY-MM-DD si lo declara. */
  fechaVencimiento: string | null;
  /** Indicador de servicio (3 = factura por servicios). */
  indicadorServicio: number | null;

  emisor: {
    rut: string;
    razonSocial: string;
    giro: string;
    actividadEconomica: string | null;
    direccion: string;
    comuna: string;
    ciudad: string;
    telefono: string | null;
    correo: string | null;
    sucursal: string | null;
  };

  receptor: {
    rut: string;
    razonSocial: string;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
    contacto: string | null;
    correo: string | null;
  };

  totales: {
    neto: number;
    exento: number;
    tasaIva: number;
    iva: number;
    total: number;
  };

  lineas: Array<{
    nroLinea: number;
    codigo: string | null;
    nombre: string;
    descripcion: string | null;
    cantidad: number;
    unidad: string | null;
    precio: number;
    descuento: number;
    monto: number;
    isExempt: boolean;
  }>;

  referencias: Array<{
    nroLinea: number;
    tipoDoc: string;
    folio: string;
    fecha: string;
    codigo: number | null;
    razon: string | null;
  }>;

  /** Bloque <TED>...</TED> serializado como string para generar PDF417. */
  ted: string;

  /** Timestamp de firma del DTE (ISO). */
  tmstFirma: string | null;
}

/**
 * Parsea un buffer XML de DTE firmado y devuelve los datos. Lanza si
 * el XML no tiene la estructura esperada del SII.
 */
export function parseDteXml(xmlBuffer: Buffer): DteParsed {
  const xml = xmlBuffer.toString("utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  });

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    throw new Error(
      `XML del DTE inválido: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const documento = parsed?.DTE?.Documento;
  if (!documento) {
    throw new Error("XML del DTE no contiene <DTE><Documento>...</Documento></DTE>.");
  }

  const documentId = documento["@_ID"] ?? "";
  const enc = documento.Encabezado;
  if (!enc) throw new Error("XML del DTE no contiene <Encabezado>.");

  const idDoc = enc.IdDoc ?? {};
  const tipoDte = parseInt(String(idDoc.TipoDTE ?? "0"), 10);
  const folio = parseInt(String(idDoc.Folio ?? "0"), 10);
  const fechaEmision = String(idDoc.FchEmis ?? "");
  const formaPago = idDoc.FmaPago ? parseInt(String(idDoc.FmaPago), 10) : null;
  const fechaVencimiento = idDoc.FchVenc ? String(idDoc.FchVenc) : null;
  const indicadorServicio = idDoc.IndServicio
    ? parseInt(String(idDoc.IndServicio), 10)
    : null;

  const emisorXml = enc.Emisor ?? {};
  const emisor = {
    rut: String(emisorXml.RUTEmisor ?? ""),
    razonSocial: String(emisorXml.RznSoc ?? emisorXml.RznSocEmisor ?? ""),
    giro: String(emisorXml.GiroEmis ?? emisorXml.GiroEmisor ?? ""),
    actividadEconomica: emisorXml.Acteco ? String(emisorXml.Acteco) : null,
    direccion: String(emisorXml.DirOrigen ?? ""),
    comuna: String(emisorXml.CmnaOrigen ?? ""),
    ciudad: String(emisorXml.CiudadOrigen ?? ""),
    telefono: emisorXml.Telefono
      ? Array.isArray(emisorXml.Telefono)
        ? String(emisorXml.Telefono[0])
        : String(emisorXml.Telefono)
      : null,
    correo: emisorXml.CorreoEmisor ? String(emisorXml.CorreoEmisor) : null,
    sucursal: emisorXml.Sucursal ? String(emisorXml.Sucursal) : null,
  };

  const receptorXml = enc.Receptor ?? {};
  const receptor = {
    rut: String(receptorXml.RUTRecep ?? ""),
    razonSocial: String(receptorXml.RznSocRecep ?? ""),
    giro: receptorXml.GiroRecep ? String(receptorXml.GiroRecep) : null,
    direccion: receptorXml.DirRecep ? String(receptorXml.DirRecep) : null,
    comuna: receptorXml.CmnaRecep ? String(receptorXml.CmnaRecep) : null,
    ciudad: receptorXml.CiudadRecep ? String(receptorXml.CiudadRecep) : null,
    contacto: receptorXml.Contacto ? String(receptorXml.Contacto) : null,
    correo: receptorXml.CorreoRecep ? String(receptorXml.CorreoRecep) : null,
  };

  const totalesXml = enc.Totales ?? {};
  const totales = {
    neto: parseInt(String(totalesXml.MntNeto ?? "0"), 10),
    exento: parseInt(String(totalesXml.MntExe ?? "0"), 10),
    tasaIva: parseFloat(String(totalesXml.TasaIVA ?? "0")),
    iva: parseInt(String(totalesXml.IVA ?? "0"), 10),
    total: parseInt(String(totalesXml.MntTotal ?? "0"), 10),
  };

  // Detalle puede venir como object (1 línea) o array (N).
  const detalleRaw = documento.Detalle ?? [];
  const detalleArr = Array.isArray(detalleRaw) ? detalleRaw : [detalleRaw];
  const lineas = detalleArr
    .filter(Boolean)
    .map((d: any) => ({
      nroLinea: parseInt(String(d.NroLinDet ?? "0"), 10),
      codigo: extractCodigoItem(d),
      nombre: String(d.NmbItem ?? ""),
      descripcion: d.DscItem ? String(d.DscItem) : null,
      cantidad: parseFloat(String(d.QtyItem ?? "0")),
      unidad: d.UnmdItem ? String(d.UnmdItem) : null,
      precio: parseFloat(String(d.PrcItem ?? "0")),
      descuento: parseFloat(String(d.DescuentoMonto ?? "0")),
      monto: parseInt(String(d.MontoItem ?? "0"), 10),
      isExempt: d.IndExe === "1" || d.IndExe === 1,
    }));

  const referenciaRaw = documento.Referencia ?? [];
  const refArr = Array.isArray(referenciaRaw)
    ? referenciaRaw
    : referenciaRaw
      ? [referenciaRaw]
      : [];
  const referencias = refArr.map((r: any) => ({
    nroLinea: parseInt(String(r.NroLinRef ?? "0"), 10),
    tipoDoc: String(r.TpoDocRef ?? ""),
    folio: String(r.FolioRef ?? ""),
    fecha: String(r.FchRef ?? ""),
    codigo: r.CodRef ? parseInt(String(r.CodRef), 10) : null,
    razon: r.RazonRef ? String(r.RazonRef) : null,
  }));

  // El TED hay que serializarlo de vuelta a XML porque PDF417 lo
  // necesita como string compacto (esa es la fuente de verdad del
  // timbre que el SII valida al escanearlo).
  const tedXml = extractTedFromRawXml(xml);

  const tmstFirma = documento.TmstFirma ? String(documento.TmstFirma) : null;

  return {
    documentId,
    tipoDte,
    folio,
    fechaEmision,
    formaPago,
    fechaVencimiento,
    indicadorServicio,
    emisor,
    receptor,
    totales,
    lineas,
    referencias,
    ted: tedXml,
    tmstFirma,
  };
}

function extractCodigoItem(d: any): string | null {
  if (!d.CdgItem) return null;
  const c = Array.isArray(d.CdgItem) ? d.CdgItem[0] : d.CdgItem;
  return c?.VlrCodigo ? String(c.VlrCodigo) : null;
}

/**
 * Extrae el bloque <TED ...>...</TED> del XML raw, preservando el
 * formato exacto. PDF417 necesita el TED como string para generar el
 * código de barras que luego el SII valida al escanearlo.
 */
function extractTedFromRawXml(xml: string): string {
  const match = xml.match(/<TED[\s\S]*?<\/TED>/);
  if (!match) {
    throw new Error("XML del DTE no contiene bloque <TED> (timbre electrónico).");
  }
  return match[0];
}

/**
 * Devuelve los nombres SII oficiales para cada tipo de DTE.
 * Se usa en el header del PDF ("FACTURA ELECTRONICA", "BOLETA", etc.)
 */
export function getDteTypeName(tipoDte: number): string {
  const map: Record<number, string> = {
    33: "FACTURA ELECTRONICA",
    34: "FACTURA NO AFECTA O EXENTA ELECTRONICA",
    39: "BOLETA ELECTRONICA",
    41: "BOLETA EXENTA ELECTRONICA",
    43: "LIQUIDACION FACTURA ELECTRONICA",
    46: "FACTURA DE COMPRA ELECTRONICA",
    52: "GUIA DE DESPACHO ELECTRONICA",
    56: "NOTA DE DEBITO ELECTRONICA",
    61: "NOTA DE CREDITO ELECTRONICA",
  };
  return map[tipoDte] ?? `DTE TIPO ${tipoDte}`;
}

/**
 * Devuelve el nombre del tipo de documento referenciado para imprimir
 * en el cuadro de Referencias. Códigos según SII.
 */
export function getReferenciaTipoName(tipo: string): string {
  const map: Record<string, string> = {
    "30": "FACTURA",
    "32": "FACTURA NO AFECTA",
    "33": "FACTURA ELECTRONICA",
    "34": "FACTURA EXENTA ELECTRONICA",
    "35": "BOLETA",
    "38": "BOLETA HONORARIOS",
    "39": "BOLETA ELECTRONICA",
    "41": "BOLETA EXENTA ELECTRONICA",
    "46": "FACTURA DE COMPRA",
    "52": "GUIA DE DESPACHO",
    "56": "NOTA DE DEBITO",
    "61": "NOTA DE CREDITO",
    "801": "ORDEN DE COMPRA",
    "802": "NOTA DE PEDIDO",
    "803": "CONTRATO",
    "804": "RESOLUCION",
    "805": "PROCESO CHILECOMPRA",
    "806": "FICHA CHILECOMPRA",
    HES: "HOJA ENTRADA SERVICIOS",
  };
  return map[tipo] ?? tipo;
}

/**
 * Convierte un número de pesos a un literal en palabras
 * (ej. 1.189.998 → "UNO MILLÓN CIENTO OCHENTA Y NUEVE MIL ...").
 * Necesario para los DTEs chilenos que llevan el monto en letras.
 */
export function montoEnPalabras(monto: number): string {
  if (monto === 0) return "CERO";
  const negativo = monto < 0;
  let n = Math.abs(Math.trunc(monto));

  const unidades = [
    "",
    "UNO",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
    "DIEZ",
    "ONCE",
    "DOCE",
    "TRECE",
    "CATORCE",
    "QUINCE",
    "DIECISÉIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
    "VEINTE",
    "VEINTIUNO",
    "VEINTIDÓS",
    "VEINTITRÉS",
    "VEINTICUATRO",
    "VEINTICINCO",
    "VEINTISÉIS",
    "VEINTISIETE",
    "VEINTIOCHO",
    "VEINTINUEVE",
  ];
  const decenas = [
    "",
    "",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];
  const centenas = [
    "",
    "CIENTO",
    "DOSCIENTOS",
    "TRESCIENTOS",
    "CUATROCIENTOS",
    "QUINIENTOS",
    "SEISCIENTOS",
    "SETECIENTOS",
    "OCHOCIENTOS",
    "NOVECIENTOS",
  ];

  function tres(num: number): string {
    if (num === 0) return "";
    if (num === 100) return "CIEN";
    const c = Math.floor(num / 100);
    const r = num % 100;
    let out = c > 0 ? centenas[c] : "";
    if (r === 0) return out;
    if (r < 30) {
      out = (out ? out + " " : "") + unidades[r];
    } else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      out = (out ? out + " " : "") + decenas[d];
      if (u > 0) out += " Y " + unidades[u];
    }
    return out;
  }

  let resultado = "";
  if (n >= 1_000_000_000) {
    const m = Math.floor(n / 1_000_000_000);
    resultado += (m === 1 ? "MIL" : tres(m) + " MIL") + " MILLONES ";
    n = n % 1_000_000_000;
  }
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    resultado += (m === 1 ? "UN MILLÓN " : tres(m) + " MILLONES ");
    n = n % 1_000_000;
  }
  if (n >= 1_000) {
    const m = Math.floor(n / 1_000);
    resultado += (m === 1 ? "MIL " : tres(m) + " MIL ");
    n = n % 1_000;
  }
  if (n > 0) {
    resultado += tres(n);
  }

  return (negativo ? "MENOS " : "") + resultado.trim();
}
