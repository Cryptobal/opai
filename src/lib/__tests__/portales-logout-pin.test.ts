// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  empresaLogoutPinKey,
  evaluateLogoutPin,
  FALLBACK_LOGOUT_PIN,
  normalizeLogoutPin,
  pickLogoutPinValue,
  PIN_NOT_CONFIGURED_MESSAGE,
} from "../portales-logout-pin";

describe("normalizeLogoutPin", () => {
  it("deja solo 4 dígitos", () => {
    expect(normalizeLogoutPin("7864")).toBe("7864");
    expect(normalizeLogoutPin(" 7 8 6 4 ")).toBe("7864");
    expect(normalizeLogoutPin("7864\n")).toBe("7864");
    expect(normalizeLogoutPin("78ab64")).toBe("7864");
    expect(normalizeLogoutPin("123456")).toBe("1234");
    expect(normalizeLogoutPin(null)).toBe("");
    expect(normalizeLogoutPin(undefined)).toBe("");
  });
});

describe("pickLogoutPinValue", () => {
  it("prefiere empresa:{tenantId}:portales.logoutPin sobre el legacy", () => {
    const pin = pickLogoutPinValue(
      [
        { key: "portales.logoutPin", value: "0000", tenantId: "ten-a" },
        { key: empresaLogoutPinKey("ten-a"), value: "7864", tenantId: "ten-a" },
      ],
      ["ten-a"],
    );
    expect(pin).toBe("7864");
  });

  it("cae al legacy portales.logoutPin del tenant", () => {
    const pin = pickLogoutPinValue(
      [{ key: "portales.logoutPin", value: "7864", tenantId: "ten-a" }],
      ["ten-a"],
    );
    expect(pin).toBe("7864");
  });

  it("usa el tenant de instalación antes que el del dispositivo", () => {
    const pin = pickLogoutPinValue(
      [
        { key: empresaLogoutPinKey("device-tenant"), value: "1111", tenantId: "device-tenant" },
        { key: empresaLogoutPinKey("inst-tenant"), value: "7864", tenantId: "inst-tenant" },
      ],
      ["inst-tenant", "device-tenant"],
    );
    expect(pin).toBe("7864");
  });

  it("acepta el PIN global legacy (tenantId null)", () => {
    const pin = pickLogoutPinValue(
      [{ key: "portales.logoutPin", value: "7864", tenantId: null }],
      ["ten-a"],
    );
    expect(pin).toBe("7864");
  });

  it("ignora valores que no son PIN de 4 dígitos", () => {
    expect(
      pickLogoutPinValue(
        [{ key: empresaLogoutPinKey("ten-a"), value: "12", tenantId: "ten-a" }],
        ["ten-a"],
      ),
    ).toBe("");
  });
});

describe("evaluateLogoutPin", () => {
  it("PIN_MISMATCH solo si hay PIN configurado", () => {
    expect(evaluateLogoutPin("7864", "0000")).toEqual({ ok: false, code: "PIN_MISMATCH" });
    expect(evaluateLogoutPin("7864", "7864")).toEqual({ ok: true });
  });

  it("no compara en silencio contra 0000 si no hay PIN", () => {
    expect(evaluateLogoutPin("", "7864")).toEqual({
      ok: false,
      code: "PIN_NOT_CONFIGURED",
      error: PIN_NOT_CONFIGURED_MESSAGE,
    });
  });

  it("acepta 0000 como fallback explícito si no hay PIN de empresa", () => {
    expect(evaluateLogoutPin("", FALLBACK_LOGOUT_PIN)).toEqual({ ok: true });
    expect(evaluateLogoutPin("12", "0000")).toEqual({ ok: true });
  });
});
