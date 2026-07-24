import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubQuickActions } from "../HubQuickActions";
import type { HubPerms } from "../../_lib/hub-types";

function perms(overrides: Partial<HubPerms> = {}): HubPerms {
  return {
    hasCrm: true,
    hasAgenda: true,
    hasCorreos: true,
    hasTareas: true,
    hasDocs: false,
    hasFinance: false,
    hasOps: true,
    hasAts: false,
    hasPayroll: false,
    hasPersonas: true,
    canOpenLeads: true,
    canOpenDeals: true,
    canEditDeals: true,
    canOpenQuotes: true,
    canCreateProposal: false,
    canConfigureCrm: false,
    canApproveTE: false,
    canManageRefuerzos: false,
    canApproveRendicion: false,
    canMarkAttendance: true,
    hasSupervision: false,
    hasSupervisionCheckin: false,
    hasFinanceRendiciones: false,
    ...overrides,
  };
}

describe("HubQuickActions", () => {
  it("orden canónico: Calendario → Correo → Tareas → Crear", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    const mobile = container.querySelector(".lg\\:hidden");
    expect(mobile).toBeTruthy();
    const labels = Array.from(
      mobile!.querySelectorAll("a span:last-child, button span:last-child"),
    ).map((el) => el.textContent?.trim());
    expect(labels).toEqual(["Calendario", "Correo", "Tareas", "Crear"]);
  });

  it("Calendario visible directo en móvil con destino /opai/agenda", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    const links = Array.from(container.querySelectorAll('a[href="/opai/agenda"]'));
    // Tile móvil + botón desktop
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Calendario").length).toBeGreaterThanOrEqual(1);
  });

  it("Correo visible con destino /crm/correos", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    expect(container.querySelectorAll('a[href="/crm/correos"]').length)
      .toBeGreaterThanOrEqual(2);
  });

  it("Tareas visible después de Correo con destino /opai/tareas", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    expect(container.querySelectorAll('a[href="/opai/tareas"]').length)
      .toBeGreaterThanOrEqual(2);
    // Desktop: Correo aparece antes que Tareas en el row inline
    const desktop = container.querySelector(".hidden.lg\\:flex");
    const desktopHrefs = Array.from(desktop!.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    const correoIdx = desktopHrefs.indexOf("/crm/correos");
    const tareasIdx = desktopHrefs.indexOf("/opai/tareas");
    expect(correoIdx).toBeGreaterThanOrEqual(0);
    expect(tareasIdx).toBeGreaterThan(correoIdx);
  });

  it("Crear abre el sheet existente (acciones secundarias no visibles directo)", () => {
    render(<HubQuickActions perms={perms()} />);
    expect(screen.getByText("Crear")).toBeTruthy();
    // La acción secundaria vive en el sheet (cerrado) y en el row desktop.
    const marcar = screen.getAllByText("Marcar Asistencia");
    expect(marcar.length).toBeGreaterThanOrEqual(1);
  });

  it("sin acceso productividad no muestra Calendario, Correo ni Tareas", () => {
    const { container } = render(
      <HubQuickActions
        perms={perms({
          hasAgenda: false,
          hasCorreos: false,
          hasTareas: false,
        })}
      />,
    );
    expect(container.querySelector('a[href="/opai/agenda"]')).toBeNull();
    expect(container.querySelector('a[href="/crm/correos"]')).toBeNull();
    expect(container.querySelector('a[href="/opai/tareas"]')).toBeNull();
  });

  it("sin productividad ni acciones → no renderiza nada", () => {
    const { container } = render(
      <HubQuickActions
        perms={perms({
          hasAgenda: false,
          hasCorreos: false,
          hasTareas: false,
          hasPersonas: false,
          canMarkAttendance: false,
        })}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
