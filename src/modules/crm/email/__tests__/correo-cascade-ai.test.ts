import { describe, expect, it } from "vitest";
import { selectionForCascadeAi } from "../correo-cascade-ai";

describe("selectionForCascadeAi", () => {
  it("cuenta: solo account", () => {
    const s = selectionForCascadeAi("account");
    expect([...s.selectedIds]).toEqual(["account"]);
    expect(s.include.deal).toBe(false);
    expect(s.include.quote).toBe(false);
  });

  it("negocio: account + deal", () => {
    const s = selectionForCascadeAi("deal");
    expect(s.selectedIds.has("account")).toBe(true);
    expect(s.selectedIds.has("deal")).toBe(true);
    expect(s.selectedIds.has("quote")).toBe(false);
    expect(s.include.deal).toBe(true);
    expect(s.include.installations).toBe(false);
  });

  it("cotización: account + quote (negocio del hilo se reutiliza en create)", () => {
    // No fuerza deal en el plan: createCrmStructureFromProposal vincula al
    // dealId del hilo si existe y es de la misma cuenta.
    const s = selectionForCascadeAi("quote");
    expect([...s.selectedIds].sort()).toEqual(["account", "quote"]);
    expect(s.include.quote).toBe(true);
    expect(s.include.deal).toBe(false);
  });

  it("instalación: account + installations", () => {
    const s = selectionForCascadeAi("installation");
    expect([...s.selectedIds].sort()).toEqual(["account", "installations"]);
    expect(s.include.installations).toBe(true);
    expect(s.include.deal).toBe(false);
  });
});
