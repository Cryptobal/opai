import { describe, expect, it } from "vitest";
import { campaignItemStatusFromError } from "../laborales/campaign-process";

describe("campaña masiva — clasificación de ítems", () => {
  it("omite firma en curso y sin contacto", () => {
    expect(campaignItemStatusFromError("Ya existe una solicitud de firma en curso para esta plantilla")).toBe("skipped");
    expect(campaignItemStatusFromError("El trabajador no tiene email de contacto")).toBe("skipped");
  });

  it("marca error operativo", () => {
    expect(campaignItemStatusFromError("sin supervisor: instalación sin supervisor")).toBe("error");
    expect(campaignItemStatusFromError("guardia inactivo")).toBe("error");
  });
});
