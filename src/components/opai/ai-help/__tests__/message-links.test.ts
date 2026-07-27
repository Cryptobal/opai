import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNavigationTarget } from "../message-render";

describe("resolveNavigationTarget (contrato PR #760)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rechaza javascript: y data:", () => {
    expect(resolveNavigationTarget("javascript:alert(1)")).toEqual({
      kind: "external",
      url: "javascript:alert(1)",
    });
    expect(resolveNavigationTarget("data:text/html,hi")).toEqual({
      kind: "external",
      url: "data:text/html,hi",
    });
    expect(resolveNavigationTarget("  JAVAScript:void(0)  ").kind).toBe("external");
  });

  it("trata rutas relativas same-origin como internas", () => {
    expect(resolveNavigationTarget("/crm/leads")).toEqual({
      kind: "internal",
      path: "/crm/leads",
    });
    expect(resolveNavigationTarget("/ops/tickets?id=1#top")).toEqual({
      kind: "internal",
      path: "/ops/tickets?id=1#top",
    });
  });

  it("detecta same-origin absoluto cuando hay window", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.test" },
    });
    expect(
      resolveNavigationTarget("https://app.example.test/hub?tab=ops"),
    ).toEqual({
      kind: "internal",
      path: "/hub?tab=ops",
    });
  });

  it("marca orígenes ajenos como externos", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.test" },
    });
    expect(resolveNavigationTarget("https://evil.example/x")).toEqual({
      kind: "external",
      url: "https://evil.example/x",
    });
  });

  it("ante parseo fallido cae a externo", () => {
    // URL constructor falla con ciertos inputs en runtime sin base válida
    const result = resolveNavigationTarget("http://[");
    expect(result.kind).toBe("external");
  });

  it("rechaza protocol-relative // como no-interna por path", () => {
    const result = resolveNavigationTarget("//evil.example/phish");
    // No es path relativo "/…"; se intenta parsear como URL
    expect(result.kind).toBe("external");
  });
});
