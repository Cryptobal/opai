// @vitest-environment node
import { describe, expect, it } from "vitest";
import { googleAdminLookupPlan, normalizeGoogleEmail } from "../auth-google-admin";

describe("normalizeGoogleEmail", () => {
  it("trim y lowercase", () => {
    expect(normalizeGoogleEmail("  carlos@GARD.CL ")).toBe("carlos@gard.cl");
  });

  it("vacío si falta", () => {
    expect(normalizeGoogleEmail(null)).toBe("");
    expect(normalizeGoogleEmail(undefined)).toBe("");
  });
});

describe("googleAdminLookupPlan", () => {
  it("prioriza email normalizado y conserva el sub de Google", () => {
    expect(
      googleAdminLookupPlan({
        email: " Carlos@Gard.CL ",
        googleSub: "google-sub-owner-1",
      }),
    ).toEqual({
      email: "carlos@gard.cl",
      googleSub: "google-sub-owner-1",
    });
  });

  it("permite match solo por googleId si no hay email", () => {
    expect(
      googleAdminLookupPlan({
        email: "   ",
        googleSub: "abc-sub",
      }),
    ).toEqual({
      email: null,
      googleSub: "abc-sub",
    });
  });

  it("no inventa sub vacío", () => {
    expect(
      googleAdminLookupPlan({
        email: "a@b.cl",
        googleSub: "  ",
      }),
    ).toEqual({
      email: "a@b.cl",
      googleSub: null,
    });
  });
});
