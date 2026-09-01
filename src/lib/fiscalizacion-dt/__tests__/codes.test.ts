import { describe, expect, it } from "vitest";
import {
  DT_CODE_ALPHABET,
  DT_CODE_LENGTH,
  DT_CODE_TTL_MS,
  dtCodeExpiresAt,
  generateDtAccessCode,
  hashDtAccessCode,
  isDtCodeExpired,
  timingSafeHashEqual,
} from "../codes";

describe("claves DT Art. 23 c", () => {
  it("genera 10 caracteres del alfabeto sin ambigüedad", () => {
    const code = generateDtAccessCode();
    expect(code).toHaveLength(DT_CODE_LENGTH);
    expect([...code].every((c) => DT_CODE_ALPHABET.includes(c))).toBe(true);
    expect(code).not.toMatch(/[IO01]/);
  });

  it("el hash SHA-256 es estable e independiente de mayúsculas", () => {
    const hash = hashDtAccessCode("AB23CD45EF");
    expect(hash).toHaveLength(64);
    expect(hashDtAccessCode("ab23cd45ef")).toBe(hash);
    expect(timingSafeHashEqual(hash, hashDtAccessCode("AB23CD45EF"))).toBe(true);
  });

  it("caduca exactamente a los 5 días corridos", () => {
    const from = new Date("2026-09-01T12:00:00.000Z");
    const exp = dtCodeExpiresAt(from);
    expect(exp.getTime() - from.getTime()).toBe(DT_CODE_TTL_MS);
    expect(DT_CODE_TTL_MS).toBe(5 * 24 * 60 * 60 * 1000);
    expect(isDtCodeExpired(exp, from)).toBe(false);
    expect(isDtCodeExpired(exp, new Date(exp.getTime()))).toBe(true);
    expect(isDtCodeExpired(exp, new Date(exp.getTime() + 1))).toBe(true);
    expect(isDtCodeExpired(exp, new Date(exp.getTime() - 1))).toBe(false);
  });
});
