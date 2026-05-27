import { describe, it, expect } from "vitest";
import { parseDteXml } from "../dte-xml-parser";

describe("parseDteXml — encoding detection", () => {
  it("decodifica correctamente XML SII en ISO-8859-1 con Ñ y acentos", () => {
    const xmlLatin1 =
      `<?xml version="1.0" encoding="ISO-8859-1"?>` +
      `<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">` +
      `<Documento ID="F1-T33">` +
      `<Encabezado>` +
      `<IdDoc><TipoDTE>33</TipoDTE><Folio>1</Folio><FchEmis>2026-05-27</FchEmis></IdDoc>` +
      `<Emisor><RUTEmisor>76000000-1</RUTEmisor><RznSoc>ACME LTDA</RznSoc><GiroEmis>x</GiroEmis><Acteco>1</Acteco><DirOrigen>x</DirOrigen><CmnaOrigen>x</CmnaOrigen></Emisor>` +
      `<Receptor><RUTRecep>65136824-3</RUTRecep><RznSocRecep>CONDOMINIO ALTO LO CA\xD1AS</RznSocRecep><GiroRecep>x</GiroRecep><DirRecep>EL HUALLE NORTE 7815</DirRecep><CmnaRecep>LA FLORIDA</CmnaRecep></Receptor>` +
      `<Totales><MntNeto>1000</MntNeto><TasaIVA>19</TasaIVA><IVA>190</IVA><MntTotal>1190</MntTotal></Totales>` +
      `</Encabezado>` +
      `<Detalle><NroLinDet>1</NroLinDet><NmbItem>Servicio A\xF1o 2026</NmbItem><QtyItem>1</QtyItem><PrcItem>1000</PrcItem><MontoItem>1000</MontoItem></Detalle>` +
      `<TED version="1.0"><DD><RE>76000000-1</RE><TD>33</TD><F>1</F><FE>2026-05-27</FE><RR>65136824-3</RR><RSR>x</RSR><MNT>1190</MNT><IT1>x</IT1><CAF version="1.0"></CAF><TSTED>2026-05-27T00:00:00</TSTED></DD><FRMT algoritmo="SHA1withRSA">x</FRMT></TED>` +
      `</Documento></DTE>`;

    const buf = Buffer.from(xmlLatin1, "latin1");
    const parsed = parseDteXml(buf);

    expect(parsed.receptor.razonSocial).toBe("CONDOMINIO ALTO LO CAÑAS");
    expect(parsed.receptor.razonSocial).not.toContain("�");
    expect(parsed.lineas[0]?.nombre).toBe("Servicio Año 2026");
  });

  it("decodifica correctamente XML en UTF-8 cuando lo declara", () => {
    const xmlUtf8 =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">` +
      `<Documento ID="F2-T33">` +
      `<Encabezado>` +
      `<IdDoc><TipoDTE>33</TipoDTE><Folio>2</Folio><FchEmis>2026-05-27</FchEmis></IdDoc>` +
      `<Emisor><RUTEmisor>76000000-1</RUTEmisor><RznSoc>ACME</RznSoc><GiroEmis>x</GiroEmis><Acteco>1</Acteco><DirOrigen>x</DirOrigen><CmnaOrigen>x</CmnaOrigen></Emisor>` +
      `<Receptor><RUTRecep>1-9</RUTRecep><RznSocRecep>ÑOÑO</RznSocRecep><GiroRecep>x</GiroRecep><DirRecep>x</DirRecep><CmnaRecep>x</CmnaRecep></Receptor>` +
      `<Totales><MntNeto>0</MntNeto><TasaIVA>19</TasaIVA><IVA>0</IVA><MntTotal>0</MntTotal></Totales>` +
      `</Encabezado>` +
      `<Detalle><NroLinDet>1</NroLinDet><NmbItem>x</NmbItem><QtyItem>1</QtyItem><PrcItem>0</PrcItem><MontoItem>0</MontoItem></Detalle>` +
      `<TED version="1.0"><DD><RE>76000000-1</RE><TD>33</TD><F>2</F><FE>2026-05-27</FE><RR>1-9</RR><RSR>x</RSR><MNT>0</MNT><IT1>x</IT1><CAF version="1.0"></CAF><TSTED>2026-05-27T00:00:00</TSTED></DD><FRMT algoritmo="SHA1withRSA">x</FRMT></TED>` +
      `</Documento></DTE>`;

    const buf = Buffer.from(xmlUtf8, "utf-8");
    const parsed = parseDteXml(buf);

    expect(parsed.receptor.razonSocial).toBe("ÑOÑO");
    expect(parsed.receptor.razonSocial).not.toContain("�");
  });
});
