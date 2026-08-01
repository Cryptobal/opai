import { describe, expect, it } from "vitest";
import {
  attachFromPhotoUrl,
  extractEmails,
  normalizeEmail,
} from "../email-avatars";

describe("email-avatars helpers", () => {
  it("normalizeEmail parsea From con nombre", () => {
    expect(normalizeEmail('"Juan Pérez" <juan@gard.cl>')).toBe("juan@gard.cl");
    expect(normalizeEmail("Juan <juan@gard.cl>")).toBe("juan@gard.cl");
    expect(normalizeEmail("juan@gard.cl")).toBe("juan@gard.cl");
  });

  it("normalizeEmail rechaza basura", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("sin-arroba")).toBeNull();
  });

  it("extractEmails deduplica y normaliza", () => {
    expect(
      extractEmails(["A <a@x.com>", "a@x.com", "B <b@y.com>", null]).sort(),
    ).toEqual(["a@x.com", "b@y.com"]);
  });

  it("attachFromPhotoUrl adjunta por email", () => {
    const map = new Map([["a@x.com", "https://cdn/a.jpg"]]);
    const out = attachFromPhotoUrl(
      [{ fromEmail: "A <a@x.com>" }, { fromEmail: "b@y.com" }],
      map,
    );
    expect(out[0].fromPhotoUrl).toBe("https://cdn/a.jpg");
    expect(out[1].fromPhotoUrl).toBeNull();
  });
});
