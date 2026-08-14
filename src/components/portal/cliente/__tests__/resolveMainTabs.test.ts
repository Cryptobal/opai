import { describe, it, expect } from "vitest";
import { DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import { resolveMainTabs } from "@/components/portal/cliente/PortalClienteNav";

describe("resolveMainTabs", () => {
  it("cliente activo: Inicio, Rondas, Equipo, Tickets", () => {
    expect(resolveMainTabs(DEFAULT_PORTAL_CONFIG, false)).toEqual([
      "dashboard",
      "rondas",
      "personal",
      "tickets",
    ]);
  });

  it("prospecto: Tickets se sustituye por Propuesta (cotizaciones)", () => {
    expect(resolveMainTabs(DEFAULT_PORTAL_CONFIG, true)).toEqual([
      "dashboard",
      "rondas",
      "personal",
      "cotizaciones",
    ]);
  });

  it("tickets oculto: el 4.º slot se llena con el siguiente visible", () => {
    const tabs = resolveMainTabs(
      { ...DEFAULT_PORTAL_CONFIG, tickets: false },
      false,
    );
    expect(tabs).toHaveLength(4);
    expect(tabs).not.toContain("tickets");
    expect(tabs[0]).toBe("dashboard");
  });
});
