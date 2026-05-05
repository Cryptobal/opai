import { describe, it, expect } from "vitest";
import { parseCaf, CafParseError } from "../dte-caf-parser";

const validCafXml = `<?xml version="1.0"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>12345678-9</RE>
      <RS>EMPRESA DEMO</RS>
      <TD>33</TD>
      <RNG>
        <D>1</D>
        <H>100</H>
      </RNG>
      <FA>2025-01-15</FA>
      <RSAPK><M>aaa</M><E>AQAB</E></RSAPK>
      <IDK>300</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">xxxxxx</FRMA>
  </CAF>
  <RSASK>-----BEGIN RSA PRIVATE KEY-----...</RSASK>
  <RSAPUBK>-----BEGIN PUBLIC KEY-----...</RSAPUBK>
</AUTORIZACION>`;

describe("parseCaf", () => {
  it("parses a valid CAF XML", () => {
    const meta = parseCaf(Buffer.from(validCafXml));
    expect(meta.rutEmisor).toBe("12345678-9");
    expect(meta.razonSocial).toBe("EMPRESA DEMO");
    expect(meta.dteType).toBe(33);
    expect(meta.folioDesde).toBe(1);
    expect(meta.folioHasta).toBe(100);
  });

  it("throws on missing AUTORIZACION root", () => {
    expect(() => parseCaf(Buffer.from("<root/>"))).toThrow(CafParseError);
  });

  it("throws on invalid RUT", () => {
    const bad = validCafXml.replace("12345678-9", "INVALID");
    expect(() => parseCaf(Buffer.from(bad))).toThrow(CafParseError);
  });

  it("throws on invalid DTE type", () => {
    const bad = validCafXml.replace("<TD>33</TD>", "<TD>999</TD>");
    expect(() => parseCaf(Buffer.from(bad))).toThrow(CafParseError);
  });

  it("throws on inverted folio range", () => {
    const bad = validCafXml.replace("<D>1</D>", "<D>500</D>");
    expect(() => parseCaf(Buffer.from(bad))).toThrow(CafParseError);
  });
});
