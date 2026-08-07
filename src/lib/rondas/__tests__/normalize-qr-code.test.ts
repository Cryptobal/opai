// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkpointQrCodesMatch,
  normalizeCheckpointQrCode,
} from "../normalize-qr-code";

describe("normalizeCheckpointQrCode", () => {
  it("normaliza código plano a mayúsculas", () => {
    expect(normalizeCheckpointQrCode("ujc57mr4")).toBe("UJC57MR4");
    expect(normalizeCheckpointQrCode("  UJC57MR4  ")).toBe("UJC57MR4");
  });

  it("extrae código desde URL absoluta", () => {
    expect(
      normalizeCheckpointQrCode("https://example.test/ronda/UJC57MR4"),
    ).toBe("UJC57MR4");
    expect(
      normalizeCheckpointQrCode("https://example.test/checkpoint/ujc57mr4?x=1"),
    ).toBe("UJC57MR4");
  });

  it("extrae código desde path relativo o query", () => {
    expect(normalizeCheckpointQrCode("/ronda/UJC57MR4")).toBe("UJC57MR4");
    expect(normalizeCheckpointQrCode("code=UJC57MR4")).toBe("UJC57MR4");
    expect(normalizeCheckpointQrCode("?qrCode=ujc57mr4")).toBe("UJC57MR4");
  });

  it("devuelve vacío ante null/blank", () => {
    expect(normalizeCheckpointQrCode(null)).toBe("");
    expect(normalizeCheckpointQrCode("   ")).toBe("");
  });
});

describe("checkpointQrCodesMatch", () => {
  it("acepta mismo código con distinto empaquetado", () => {
    expect(
      checkpointQrCodesMatch("https://example.test/ronda/UJC57MR4", "ujc57mr4"),
    ).toBe(true);
  });

  it("rechaza códigos distintos", () => {
    expect(checkpointQrCodesMatch("UJC57MR4", "AAAA1111")).toBe(false);
  });
});
