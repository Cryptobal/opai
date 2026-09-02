// @vitest-environment node
import { describe, expect, it } from "vitest";
import { erpLoginErrorMessage, safeLoginEmailPreset } from "../erp-login-errors";

describe("erpLoginErrorMessage", () => {
  it("distingue cuenta inexistente de clave incorrecta", () => {
    expect(erpLoginErrorMessage("CredentialsSignin")).toBe(
      "Email o contraseña incorrectos.",
    );
    expect(erpLoginErrorMessage("not_registered")).toContain(
      "no tiene usuario en el ERP",
    );
  });

  it("mapea tenant suspendido y cancelado", () => {
    expect(erpLoginErrorMessage("tenant_suspended")).toContain("suspendido");
    expect(erpLoginErrorMessage("tenant_cancelled")).toContain("cancelada");
  });

  it("mapea fallos OAuth de Auth.js", () => {
    expect(erpLoginErrorMessage("OAuthCallback")).toContain("Google");
    expect(erpLoginErrorMessage("Configuration")).toContain("Google");
  });
});

describe("safeLoginEmailPreset", () => {
  it("acepta un correo simple", () => {
    expect(safeLoginEmailPreset("carlos@gard.cl")).toBe("carlos@gard.cl");
    expect(safeLoginEmailPreset("  a@b.cl  ")).toBe("a@b.cl");
  });

  it("rechaza basura y valores demasiado largos", () => {
    expect(safeLoginEmailPreset("no-es-mail")).toBe("");
    expect(safeLoginEmailPreset("a@b")).toBe("");
    expect(safeLoginEmailPreset("a@" + "x".repeat(400) + ".cl")).toBe("");
    expect(safeLoginEmailPreset(null)).toBe("");
  });
});
