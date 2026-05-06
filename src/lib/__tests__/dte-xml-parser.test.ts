/**
 * Tests del parser de XML del DTE.
 *
 * Verifica que el módulo extraiga correctamente todos los campos
 * necesarios para renderizar el PDF localmente, usando un XML real
 * representativo del flujo OPAI (factura tipo 33 con TED firmado).
 */

import { describe, it, expect } from "vitest";
import {
  parseDteXml,
  getDteTypeName,
  getReferenciaTipoName,
  montoEnPalabras,
} from "../dte-xml-parser";

const VALID_DTE_XML = `<?xml version="1.0" encoding="iso-8859-1"?>
<DTE version="1.0">
<Documento ID="T_123">
<Encabezado>
<IdDoc><TipoDTE>33</TipoDTE><Folio>1688</Folio><FchEmis>2026-05-06</FchEmis></IdDoc>
<Emisor>
<RUTEmisor>11111111-1</RUTEmisor>
<RznSoc>Gard SpA</RznSoc>
<GiroEmis>Seguridad Privada</GiroEmis>
<Telefono>+56982307771</Telefono>
<Acteco>801000</Acteco>
<DirOrigen>Lo Fontecilla 201</DirOrigen>
<CmnaOrigen>Las Condes</CmnaOrigen>
<CiudadOrigen>Santiago</CiudadOrigen>
</Emisor>
<Receptor>
<RUTRecep>55555555-5</RUTRecep>
<RznSocRecep>Test Receptor</RznSocRecep>
<GiroRecep>Comercial</GiroRecep>
<DirRecep>Av Demo 123</DirRecep>
<CmnaRecep>Las Condes</CmnaRecep>
<CiudadRecep>Santiago</CiudadRecep>
</Receptor>
<Totales>
<MntNeto>999998</MntNeto>
<TasaIVA>19</TasaIVA>
<IVA>190000</IVA>
<MntTotal>1189998</MntTotal>
</Totales>
</Encabezado>
<Detalle>
<NroLinDet>1</NroLinDet>
<NmbItem>Servicio Mensual</NmbItem>
<DscItem>Vigilancia abril 2026</DscItem>
<QtyItem>1</QtyItem>
<UnmdItem>UN</UnmdItem>
<PrcItem>999998</PrcItem>
<MontoItem>999998</MontoItem>
</Detalle>
<Detalle>
<NroLinDet>2</NroLinDet>
<NmbItem>Equipo</NmbItem>
<QtyItem>2</QtyItem>
<PrcItem>50000</PrcItem>
<MontoItem>100000</MontoItem>
</Detalle>
<Referencia>
<NroLinRef>1</NroLinRef>
<TpoDocRef>801</TpoDocRef>
<FolioRef>OC-12345</FolioRef>
<FchRef>2026-04-15</FchRef>
<RazonRef>Orden de compra mensual</RazonRef>
</Referencia>
<TED version="1.0">
<DD>
<RE>11111111-1</RE>
<TD>33</TD>
<F>1688</F>
<FE>2026-05-06</FE>
<RR>55555555-5</RR>
<RSR>Test Receptor</RSR>
<MNT>1189998</MNT>
<IT1>Servicio Mensual</IT1>
<TSTED>2026-05-06T12:59:55</TSTED>
</DD>
<FRMT algoritmo="SHA1withRSA">SIGNATURE_HERE</FRMT>
</TED>
<TmstFirma>2026-05-06T12:59:55</TmstFirma>
</Documento>
</DTE>`;

describe("parseDteXml", () => {
  it("extrae los datos básicos del DTE", () => {
    const r = parseDteXml(Buffer.from(VALID_DTE_XML));
    expect(r.tipoDte).toBe(33);
    expect(r.folio).toBe(1688);
    expect(r.fechaEmision).toBe("2026-05-06");
    expect(r.documentId).toBe("T_123");
  });

  it("extrae los datos del emisor", () => {
    const r = parseDteXml(Buffer.from(VALID_DTE_XML));
    expect(r.emisor.rut).toBe("11111111-1");
    expect(r.emisor.razonSocial).toBe("Gard SpA");
    expect(r.emisor.giro).toBe("Seguridad Privada");
    expect(r.emisor.direccion).toBe("Lo Fontecilla 201");
    expect(r.emisor.comuna).toBe("Las Condes");
    expect(r.emisor.ciudad).toBe("Santiago");
    expect(r.emisor.telefono).toBe("+56982307771");
    expect(r.emisor.actividadEconomica).toBe("801000");
  });

  it("extrae los datos del receptor", () => {
    const r = parseDteXml(Buffer.from(VALID_DTE_XML));
    expect(r.receptor.rut).toBe("55555555-5");
    expect(r.receptor.razonSocial).toBe("Test Receptor");
    expect(r.receptor.giro).toBe("Comercial");
  });

  it("extrae los totales", () => {
    const r = parseDteXml(Buffer.from(VALID_DTE_XML));
    expect(r.totales.neto).toBe(999998);
    expect(r.totales.iva).toBe(190000);
    expect(r.totales.tasaIva).toBe(19);
    expect(r.totales.total).toBe(1189998);
  });

  it("maneja Detalle como array (múltiples líneas)", () => {
    const r = parseDteXml(Buffer.from(VALID_DTE_XML));
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0].nombre).toBe("Servicio Mensual");
    expect(r.lineas[0].descripcion).toBe("Vigilancia abril 2026");
    expect(r.lineas[0].cantidad).toBe(1);
    expect(r.lineas[1].nombre).toBe("Equipo");
    expect(r.lineas[1].cantidad).toBe(2);
  });

  it("extrae las referencias", () => {
    const r = parseDteXml(Buffer.from(VALID_DTE_XML));
    expect(r.referencias).toHaveLength(1);
    expect(r.referencias[0].tipoDoc).toBe("801");
    expect(r.referencias[0].folio).toBe("OC-12345");
    expect(r.referencias[0].fecha).toBe("2026-04-15");
    expect(r.referencias[0].razon).toBe("Orden de compra mensual");
  });

  it("extrae el TED como string para PDF417", () => {
    const r = parseDteXml(Buffer.from(VALID_DTE_XML));
    expect(r.ted).toContain("<TED version=\"1.0\">");
    expect(r.ted).toContain("</TED>");
    expect(r.ted).toContain("<RE>11111111-1</RE>");
    expect(r.ted).toContain("FRMT");
  });

  it("falla con error claro si el XML no tiene <Documento>", () => {
    expect(() => parseDteXml(Buffer.from("<root/>"))).toThrow(/Documento/);
  });

  it("falla con error claro si no hay TED", () => {
    const sinTed = VALID_DTE_XML.replace(/<TED[\s\S]*?<\/TED>/, "");
    expect(() => parseDteXml(Buffer.from(sinTed))).toThrow(/TED/);
  });
});

describe("getDteTypeName", () => {
  it("devuelve el nombre oficial SII de cada tipo", () => {
    expect(getDteTypeName(33)).toBe("FACTURA ELECTRONICA");
    expect(getDteTypeName(34)).toBe("FACTURA NO AFECTA O EXENTA ELECTRONICA");
    expect(getDteTypeName(39)).toBe("BOLETA ELECTRONICA");
    expect(getDteTypeName(41)).toBe("BOLETA EXENTA ELECTRONICA");
    expect(getDteTypeName(56)).toBe("NOTA DE DEBITO ELECTRONICA");
    expect(getDteTypeName(61)).toBe("NOTA DE CREDITO ELECTRONICA");
    expect(getDteTypeName(52)).toBe("GUIA DE DESPACHO ELECTRONICA");
  });

  it("devuelve fallback genérico para tipos desconocidos", () => {
    expect(getDteTypeName(999)).toBe("DTE TIPO 999");
  });
});

describe("getReferenciaTipoName", () => {
  it("devuelve el nombre humano de tipos de referencia comunes", () => {
    expect(getReferenciaTipoName("801")).toBe("ORDEN DE COMPRA");
    expect(getReferenciaTipoName("33")).toBe("FACTURA ELECTRONICA");
    expect(getReferenciaTipoName("HES")).toBe("HOJA ENTRADA SERVICIOS");
  });

  it("devuelve el código tal cual si no lo conoce", () => {
    expect(getReferenciaTipoName("XYZ")).toBe("XYZ");
  });
});

describe("montoEnPalabras", () => {
  it("convierte cifras simples", () => {
    expect(montoEnPalabras(0)).toBe("CERO");
    expect(montoEnPalabras(1)).toBe("UNO");
    expect(montoEnPalabras(15)).toBe("QUINCE");
    expect(montoEnPalabras(100)).toBe("CIEN");
    expect(montoEnPalabras(999)).toBe("NOVECIENTOS NOVENTA Y NUEVE");
  });

  it("convierte cifras con miles", () => {
    expect(montoEnPalabras(1000)).toBe("MIL");
    expect(montoEnPalabras(1500)).toBe("MIL QUINIENTOS");
    expect(montoEnPalabras(45123)).toBe(
      "CUARENTA Y CINCO MIL CIENTO VEINTITRÉS",
    );
  });

  it("convierte cifras con millones", () => {
    expect(montoEnPalabras(1000000)).toBe("UN MILLÓN");
    expect(montoEnPalabras(1189998)).toContain("UN MILLÓN");
    expect(montoEnPalabras(1189998)).toContain("CIENTO OCHENTA Y NUEVE MIL");
    expect(montoEnPalabras(1189998)).toContain("NOVECIENTOS NOVENTA Y OCHO");
  });
});
