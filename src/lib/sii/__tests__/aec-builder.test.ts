/**
 * Tests del builder del AEC.
 *
 * Validan estructura XML, presencia de campos críticos y la
 * declaración jurada Ley 19.983.
 *
 * El test "matches estructura del AEC real EOK" usa como ground truth
 * el fixture `fixtures/aec-real-eok.xml` — un AEC real de Gard que el
 * SII aceptó (TrackId 11998878336, anotación 5/may/2026 12:54).
 *
 * NO testean firma — eso es responsabilidad de aec-signer.test.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDeclaracionJuradaLey19983,
  buildUnsignedAec,
  splitRut,
  type BuildAecInput,
} from "../aec-builder";

const SAMPLE_DTE_XML = Buffer.from(
  `<?xml version="1.0" encoding="ISO-8859-1"?>` +
    `<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">` +
    `<Documento ID="DOC1">` +
    `<Encabezado>` +
    `<IdDoc><TipoDTE>33</TipoDTE><Folio>1689</Folio><FchEmis>2026-05-07</FchEmis></IdDoc>` +
    `<Emisor><RUTEmisor>77777777-7</RUTEmisor><RznSoc>Cedente Demo SpA</RznSoc></Emisor>` +
    `<Receptor><RUTRecep>99999999-9</RUTRecep><RznSocRecep>Deudor Demo</RznSocRecep></Receptor>` +
    `<Totales><MntTotal>11900</MntTotal></Totales>` +
    `</Encabezado>` +
    `</Documento>` +
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>FAKE</SignatureValue></Signature>` +
    `</DTE>`,
);

const baseInput: BuildAecInput = {
  dteXml: SAMPLE_DTE_XML,
  idDte: {
    tipoDte: 33,
    folio: 1689,
    fechaEmision: "2026-05-07",
    rutEmisor: "77777777-7",
    rznSocEmisor: "Cedente Demo SpA",
    rutReceptor: "99999999-9",
    rznSocReceptor: "Deudor Demo",
    mntTotal: 11900,
  },
  cedente: {
    rut: "77777777-7",
    razonSocial: "Cedente Demo SpA",
    direccion: "Direccion Demo 100",
    email: "facturacion@example.com",
    rutAutorizado: "11111111-1",
    nombreAutorizado: "PERSONA AUTORIZADA DEMO",
  },
  cesionario: {
    rut: "88888888-8",
    razonSocial: "Factoring Demo SpA",
    direccion: "Av. Demo 2777 piso 12",
    email: "factoring@example.com",
  },
  terminos: {
    montoCesion: 11900,
    ultimoVencimiento: "2026-07-06",
    emailDeudor: "deudor@example.com",
  },
  contacto: {
    nombre: "Contacto Demo",
    fono: "+56999999999",
    mail: "contacto@example.com",
  },
  tmstFirma: "2026-05-07T19:05:00",
};

describe("buildUnsignedAec — estructura general", () => {
  it("genera XML válido con declaración encoding ISO-8859-1", () => {
    const out = buildUnsignedAec(baseInput);
    expect(out.xml).toMatch(/^<\?xml version="1\.0" encoding="ISO-8859-1"\?>/);
    expect(out.xml).toContain("</AEC>");
  });

  it("root <AEC> incluye xmlns SiiDte + version", () => {
    const out = buildUnsignedAec(baseInput);
    // Omitimos xmlns:xsi/schemaLocation a propósito (rompen C14N de
    // xml-crypto cuando hay redeclaración de default ns en hijos firmados;
    // el SII no los exige, son opcionales informativos).
    expect(out.xml).toContain('<AEC xmlns="http://www.sii.cl/SiiDte"');
    expect(out.xml).toContain('version="1.0">');
  });

  it("DTECedido y Cesion llevan version=\"1.0\" como wrappers", () => {
    const out = buildUnsignedAec(baseInput);
    // Matcher laxo: aceptan version + xmlns redeclarado redundantemente
    // (necesario para C14N inclusive de xml-crypto, ver aec-builder.ts).
    expect(out.xml).toMatch(/<DTECedido [^>]*version="1\.0"/);
    expect(out.xml).toMatch(/<Cesion [^>]*version="1\.0"/);
  });

  it("asigna IDs únicos y predecibles a los 3 elementos firmables", () => {
    const out = buildUnsignedAec(baseInput);
    expect(out.idDocumentoDteCedido).toBe("OPAI_DTECEDIDO_1689_1");
    expect(out.idDocumentoCesion).toBe("OPAI_CESION_1689_1");
    expect(out.idDocumentoAec).toBe("OPAI_AEC_1689_1");
    expect(out.xml).toContain(`ID="${out.idDocumentoDteCedido}"`);
    expect(out.xml).toContain(`ID="${out.idDocumentoCesion}"`);
    expect(out.xml).toContain(`ID="${out.idDocumentoAec}"`);
  });

  it("inserta 3 placeholders de firma en orden DTECedido / Cesion / AEC", () => {
    const out = buildUnsignedAec(baseInput);
    const idxDtec = out.xml.indexOf("<!--SIG_DTECEDIDO-->");
    const idxCesion = out.xml.indexOf("<!--SIG_CESION-->");
    const idxAec = out.xml.indexOf("<!--SIG_AEC-->");
    expect(idxDtec).toBeGreaterThan(0);
    expect(idxCesion).toBeGreaterThan(idxDtec);
    expect(idxAec).toBeGreaterThan(idxCesion);
  });
});

describe("buildUnsignedAec — Caratula", () => {
  it("incluye RutCedente, RutCesionario, contacto y TmstFirmaEnvio", () => {
    const out = buildUnsignedAec(baseInput);
    expect(out.xml).toContain("<Caratula version=\"1.0\">");
    expect(out.xml).toContain("<RutCedente>77777777-7</RutCedente>");
    expect(out.xml).toContain("<RutCesionario>88888888-8</RutCesionario>");
    expect(out.xml).toContain("<NmbContacto>Contacto Demo</NmbContacto>");
    expect(out.xml).toContain("<FonoContacto>+56999999999</FonoContacto>");
    expect(out.xml).toContain("<MailContacto>contacto@example.com</MailContacto>");
    expect(out.xml).toContain("<TmstFirmaEnvio>2026-05-07T19:05:00</TmstFirmaEnvio>");
  });

  it("omite FonoContacto si no viene (matchea AEC real que solo tenía NmbContacto+MailContacto)", () => {
    const out = buildUnsignedAec({
      ...baseInput,
      contacto: { ...baseInput.contacto, fono: undefined },
    });
    expect(out.xml).not.toContain("<FonoContacto>");
  });
});

describe("buildUnsignedAec — DocumentoCesion / IdDTE", () => {
  it("IdDTE incluye TipoDTE, RUTEmisor, RUTReceptor, Folio, FchEmis, MntTotal", () => {
    const out = buildUnsignedAec(baseInput);
    const idDteBlock = out.xml.match(/<IdDTE>[\s\S]*?<\/IdDTE>/)?.[0] ?? "";
    expect(idDteBlock).toContain("<TipoDTE>33</TipoDTE>");
    expect(idDteBlock).toContain("<RUTEmisor>77777777-7</RUTEmisor>");
    expect(idDteBlock).toContain("<RUTReceptor>99999999-9</RUTReceptor>");
    expect(idDteBlock).toContain("<Folio>1689</Folio>");
    expect(idDteBlock).toContain("<FchEmis>2026-05-07</FchEmis>");
    expect(idDteBlock).toContain("<MntTotal>11900</MntTotal>");
  });

  it("IdDTE NO contiene RznSocEmisor ni RznSocReceptor (matchea AEC real)", () => {
    const out = buildUnsignedAec(baseInput);
    const idDteBlock = out.xml.match(/<IdDTE>[\s\S]*?<\/IdDTE>/)?.[0] ?? "";
    expect(idDteBlock).not.toContain("<RznSocEmisor>");
    expect(idDteBlock).not.toContain("<RznSocReceptor>");
    expect(idDteBlock).not.toContain("Cedente Demo SpA");
    expect(idDteBlock).not.toContain("Deudor Demo");
  });

  it("incluye SeqCesion=1, MontoCesion entero y UltimoVencimiento", () => {
    const out = buildUnsignedAec(baseInput);
    expect(out.xml).toContain("<SeqCesion>1</SeqCesion>");
    expect(out.xml).toContain("<MontoCesion>11900</MontoCesion>");
    expect(out.xml).toContain("<UltimoVencimiento>2026-07-06</UltimoVencimiento>");
  });

  it("redondea MontoCesion a entero (CLP no acepta decimales en SII)", () => {
    const out = buildUnsignedAec({
      ...baseInput,
      terminos: { ...baseInput.terminos, montoCesion: 11900.7 },
    });
    expect(out.xml).toContain("<MontoCesion>11901</MontoCesion>");
    expect(out.xml).not.toContain("<MontoCesion>11900.7</MontoCesion>");
  });

  it("incluye eMailDeudor cuando viene, lo omite cuando no", () => {
    const conEmail = buildUnsignedAec(baseInput);
    expect(conEmail.xml).toContain("<eMailDeudor>deudor@example.com</eMailDeudor>");

    const sinEmail = buildUnsignedAec({
      ...baseInput,
      terminos: { ...baseInput.terminos, emailDeudor: undefined },
    });
    expect(sinEmail.xml).not.toContain("<eMailDeudor>");
  });
});

describe("buildDeclaracionJuradaLey19983", () => {
  it("matchea el formato literal del AEC real EOK (estructura, datos demo)", () => {
    // Mismos placeholders que el fixture anonimizado fixtures/aec-real-eok.xml.
    const text = buildDeclaracionJuradaLey19983({
      cedenteRazonSocial: "EMPRESA CEDENTE DEMO SPA",
      cedenteRut: "77777777-7",
      cesionarioRazonSocial: "FACTORING DEMO S.A.",
      cesionarioRut: "88888888-8",
      deudorRazonSocial: "EMPRESA DEUDORA DEMO",
      deudorRut: "99999999-9",
    });
    // El formato exacto matchea letra por letra el del AEC real EOK
    // (incluyendo los espacios en " , RUT" y "RUT Nro 19.983"):
    const expected =
      "Se declara bajo juramento que EMPRESA CEDENTE DEMO SPA, RUT 77777777-7 ha puesto " +
      "a disposicion del cesionario FACTORING DEMO S.A. , " +
      "RUT 88888888-8, el o los documentos donde constan los recibos de " +
      "las mercaderias entregadas o servicios prestados, entregados por " +
      "parte del deudor de la factura EMPRESA DEUDORA DEMO, RUT 99999999-9, " +
      "de acuerdo a lo establecido en la Ley Nro 19.983.";
    expect(text).toBe(expected);
  });
});

describe("buildUnsignedAec — Cedente con DeclaracionJurada Ley 19.983", () => {
  it("embebe DeclaracionJurada dinámica con cedente/cesionario/deudor", () => {
    const out = buildUnsignedAec(baseInput);
    expect(out.xml).toContain("<DeclaracionJurada>");
    expect(out.declaracionJurada).toContain("Cedente Demo SpA, RUT 77777777-7");
    expect(out.declaracionJurada).toContain("Factoring Demo SpA");
    expect(out.declaracionJurada).toContain("Deudor Demo, RUT 99999999-9");
    expect(out.declaracionJurada).toContain("Ley Nro 19.983");
  });

  it("incluye RUTAutorizado con RUT + Nombre del titular del cert", () => {
    const out = buildUnsignedAec(baseInput);
    expect(out.xml).toContain("<RUTAutorizado>");
    expect(out.xml).toContain("<RUT>11111111-1</RUT>");
    expect(out.xml).toContain("<Nombre>PERSONA AUTORIZADA DEMO</Nombre>");
    expect(out.xml).toContain("</RUTAutorizado>");
  });
});

describe("buildUnsignedAec — DocumentoDTECedido embebe DTE original", () => {
  it("incluye el nodo <DTE> original íntegro pero con xmlns redundante stripeado", () => {
    const out = buildUnsignedAec(baseInput);
    // El DTE embebido tiene su xmlns="..." stripeado del tag de apertura
    // (lo hereda del root <AEC>). Sin ese strip, xml-crypto rompe C14N.
    expect(out.xml).toContain('<DTE version="1.0">');
    expect(out.xml).not.toContain('<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">');
    // Pero el contenido interno del DTE se preserva íntegro:
    expect(out.xml).toContain('<Documento ID="DOC1">');
    expect(out.xml).toContain("<Folio>1689</Folio>");
    expect(out.xml).toContain("<RUTEmisor>77777777-7</RUTEmisor>");
    expect(out.xml).toContain("<SignatureValue>FAKE</SignatureValue>");
  });

  it("agrega TmstFirma dentro del DocumentoDTECedido", () => {
    const out = buildUnsignedAec(baseInput);
    const m = out.xml.match(
      /<DocumentoDTECedido [^>]+>[\s\S]*?<TmstFirma>([^<]+)<\/TmstFirma>[\s\S]*?<\/DocumentoDTECedido>/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toBe("2026-05-07T19:05:00");
  });

  it("falla si el DTE no contiene <DTE>...</DTE> válido", () => {
    expect(() =>
      buildUnsignedAec({
        ...baseInput,
        dteXml: Buffer.from("<NotADte>oops</NotADte>"),
      }),
    ).toThrow(/<DTE>/);
  });
});

describe("buildUnsignedAec — escapado XML", () => {
  it("escapa caracteres reservados en razones sociales con & < >", () => {
    const out = buildUnsignedAec({
      ...baseInput,
      cesionario: {
        ...baseInput.cesionario,
        razonSocial: "Pérez & Asociados <Cía>",
      },
    });
    expect(out.xml).toContain("Pérez &amp; Asociados &lt;Cía&gt;");
    expect(out.xml).not.toContain("Pérez & Asociados <Cía>");
  });
});

describe("buildUnsignedAec — paridad estructural con AEC real EOK (fixture)", () => {
  /**
   * Carga el AEC que el SII aceptó EOK en producción (TrackId 11998878336)
   * y verifica que los nodos clave existan con el mismo shape en la salida
   * de nuestro builder. NO compara firmas (esas son únicas).
   */
  const realAec = readFileSync(
    join(__dirname, "fixtures", "aec-real-eok.xml"),
    "latin1",
  );

  it("el fixture es un AEC real con DocumentoAEC, Cesiones, Caratula y 3 Signature", () => {
    expect(realAec).toContain("<AEC ");
    expect(realAec).toContain("<DocumentoAEC ");
    expect(realAec).toContain("<Caratula version=\"1.0\">");
    expect(realAec).toContain("<DTECedido version=\"1.0\">");
    expect(realAec).toContain("<Cesion version=\"1.0\">");
    expect(realAec).toContain("<DocumentoDTECedido ");
    expect(realAec).toContain("<DocumentoCesion ");
    // 3 firmas externas (sobre DocumentoDTECedido / DocumentoCesion / DocumentoAEC)
    // — el AEC real las usa con xmlns="http://www.w3.org/2000/09/xmldsig#" sin prefijo.
    const sigCount = (realAec.match(/<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/g) ?? []).length;
    expect(sigCount).toBe(3);
  });

  it("nuestro builder genera la misma jerarquía de nodos que el AEC real", () => {
    const out = buildUnsignedAec(baseInput);
    // Cada elemento que el AEC real tiene, nuestro builder también:
    // Los tags que deben aparecer literalmente.
    const literalTags = [
      "<AEC ",
      "<DocumentoAEC ",
      "<Caratula version=\"1.0\">",
      "<RutCedente>",
      "<RutCesionario>",
      "<NmbContacto>",
      "<MailContacto>",
      "<TmstFirmaEnvio>",
      "<Cesiones>",
      "<DocumentoDTECedido ",
      "<TmstFirma>",
      "<DocumentoCesion ",
      "<SeqCesion>",
      "<IdDTE>",
      "<TipoDTE>",
      "<RUTEmisor>",
      "<RUTReceptor>",
      "<Folio>",
      "<FchEmis>",
      "<MntTotal>",
      "<Cedente>",
      "<RUTAutorizado>",
      "<DeclaracionJurada>",
      "<Cesionario>",
      "<MontoCesion>",
      "<UltimoVencimiento>",
      "<TmstCesion>",
    ];
    for (const tag of literalTags) {
      expect(out.xml).toContain(tag);
    }
    // <DTECedido> y <Cesion> ahora redeclaran xmlns, matcher laxo.
    expect(out.xml).toMatch(/<DTECedido [^>]*version="1\.0"/);
    expect(out.xml).toMatch(/<Cesion [^>]*version="1\.0"/);
  });

  it("preserva el orden de bloques: Caratula → Cesiones → DTECedido → Cesion", () => {
    const out = buildUnsignedAec(baseInput);
    const idxCaratula = out.xml.indexOf("<Caratula");
    const idxCesiones = out.xml.indexOf("<Cesiones>");
    const idxDtec = out.xml.indexOf("<DTECedido");
    const idxCesion = out.xml.indexOf("<Cesion ");
    expect(idxCaratula).toBeGreaterThan(0);
    expect(idxCesiones).toBeGreaterThan(idxCaratula);
    expect(idxDtec).toBeGreaterThan(idxCesiones);
    expect(idxCesion).toBeGreaterThan(idxDtec);
  });
});

describe("splitRut", () => {
  it("separa cuerpo y DV de RUTs estándar", () => {
    expect(splitRut("11111111-1")).toEqual({ cuerpo: "11111111", dv: "1" });
    expect(splitRut("12345678-5")).toEqual({ cuerpo: "12345678", dv: "5" });
  });

  it("normaliza DV K a mayúscula", () => {
    // 12345678-K es placeholder explícito en scripts/check-pii.mjs allowlist.
    expect(splitRut("12345678-k")).toEqual({ cuerpo: "12345678", dv: "K" });
    expect(splitRut("12345678-K")).toEqual({ cuerpo: "12345678", dv: "K" });
  });

  it("acepta RUT con puntos y los limpia", () => {
    expect(splitRut("11.111.111-1")).toEqual({ cuerpo: "11111111", dv: "1" });
  });

  it("falla con RUT mal formado", () => {
    expect(() => splitRut("123")).toThrow();
    expect(() => splitRut("12345678-")).toThrow();
    expect(() => splitRut("12345678-Z")).toThrow();
  });
});
