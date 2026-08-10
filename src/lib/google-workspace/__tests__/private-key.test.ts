import { describe, expect, it } from "vitest";
import { normalisePrivateKey } from "../private-key";

const PEM = `-----BEGIN PRIVATE KEY-----
ABC
-----END PRIVATE KEY-----`;

describe("normalisePrivateKey", () => {
  it("pasa PEM limpio", () => {
    expect(normalisePrivateKey(PEM)).toContain("-----BEGIN PRIVATE KEY-----");
  });

  it("convierte \\n literales", () => {
    const raw = "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n";
    const out = normalisePrivateKey(raw)!;
    expect(out).toContain("\n");
    expect(out).not.toContain("\\n");
  });

  it("quita comillas envolventes", () => {
    expect(normalisePrivateKey(`"${PEM}"`)).toBe(PEM);
    expect(normalisePrivateKey(`'${PEM}'`)).toBe(PEM);
  });

  it("vacío / undefined → undefined", () => {
    expect(normalisePrivateKey(undefined)).toBeUndefined();
    expect(normalisePrivateKey("")).toBeUndefined();
  });
});
