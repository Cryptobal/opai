import { describe, expect, it } from "vitest";
import {
  buildInitialCessionRpetcSnapshot,
  isProviderAecReferenceUrl,
  isTerminalRpetcAcceptedCode,
  mergeCessionRpetcRaw,
} from "../cession-trace.util";
import type { DteCedeResponse } from "../../shared/adapters/dte-provider.adapter";

describe("cession-trace.util", () => {
  it("detecta URL de proveedor como no-TrackId SOAP", () => {
    expect(
      isProviderAecReferenceUrl("https://bucket.s3.amazonaws.com/a.xml"),
    ).toBe(true);
    expect(isProviderAecReferenceUrl("  https://example.com/a ")).toBe(true);
    expect(isProviderAecReferenceUrl("11998878336")).toBe(false);
  });

  it("reconoce códigos terminales de aceptación", () => {
    expect(isTerminalRpetcAcceptedCode("EOK")).toBe(true);
    expect(isTerminalRpetcAcceptedCode("epr")).toBe(true);
    expect(isTerminalRpetcAcceptedCode("RCP")).toBe(false);
  });

  it("arma snapshot inicial con raw del proveedor", () => {
    const res: DteCedeResponse = {
      success: true,
      trackId: "https://example/aec.xml",
      status: "EOK",
      rawResponse: { estado: { CodigoCesion: "EOK" } },
      aecXml: Buffer.from(""),
    };
    const snap = buildInitialCessionRpetcSnapshot(res);
    expect(snap).toMatchObject({
      trackIdOrProviderRef: "https://example/aec.xml",
      providerStatusAtSubmit: "EOK",
    });
    expect(typeof (snap as Record<string, unknown>).submittedAt).toBe("string");
  });

  it("merge preserva datos previos del proveedor", () => {
    const merged = mergeCessionRpetcRaw(
      { submittedAt: "t0", foo: 1 },
      { lastSoapConsulta: { estadoEnvio: "EOK" } },
    );
    expect(merged).toMatchObject({
      submittedAt: "t0",
      foo: 1,
      lastSoapConsulta: { estadoEnvio: "EOK" },
    });
  });
});
