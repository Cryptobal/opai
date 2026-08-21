// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  generateFollowToken,
  generateReportToken,
  sanitizeUploadFileName,
  truncateToken,
} from "../tokens";

describe("tokens", () => {
  it("generateReportToken produce base64url de ~43 chars (32 bytes)", () => {
    const a = generateReportToken();
    const b = generateReportToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(b);
  });

  it("generateFollowToken es más corto y único", () => {
    const a = generateFollowToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(30);
    expect(a).not.toBe(generateFollowToken());
  });

  it("truncateToken no expone el valor completo", () => {
    const t = generateReportToken();
    const truncated = truncateToken(t);
    expect(truncated).not.toBe(t);
    expect(truncated.length).toBeLessThan(t.length);
  });

  it("sanitizeUploadFileName quita path y caracteres peligrosos", () => {
    expect(sanitizeUploadFileName("../../etc/passwd.jpg")).toBe("passwd.jpg");
    expect(sanitizeUploadFileName("foto 1 (final).png")).toMatch(/foto/);
  });
});
