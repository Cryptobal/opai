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
  it("orden canónico desktop: Calendario → Correo → Tareas → acciones", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    const desktop = container.querySelector(".hidden.lg\\:flex");
    expect(desktop).toBeTruthy();
    const hrefs = Array.from(desktop!.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/opai/agenda",
      "/crm/correos",
      "/opai/tareas",
      "/personas/guardias/ingreso-te",
      "/ops/pauta-diaria",
    ]);
  });

  it("no renderiza fila móvil (accesos viven en bottom nav / Mi día)", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    expect(container.querySelector(".lg\\:hidden")).toBeNull();
  });

  it("Calendario visible en desktop con destino /opai/agenda", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    const links = container.querySelectorAll('a[href="/opai/agenda"]');
    expect(links.length).toBe(1);
    expect(screen.getByText("Calendario")).toBeTruthy();
  });

  it("Correo visible con destino /crm/correos", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    expect(container.querySelectorAll('a[href="/crm/correos"]').length).toBe(1);
  });

  it("Tareas visible después de Correo con destino /opai/tareas", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    expect(container.querySelectorAll('a[href="/opai/tareas"]').length).toBe(1);
    const desktop = container.querySelector(".hidden.lg\\:flex");
    const desktopHrefs = Array.from(desktop!.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    const correoIdx = desktopHrefs.indexOf("/crm/correos");
    const tareasIdx = desktopHrefs.indexOf("/opai/tareas");
    expect(correoIdx).toBeGreaterThanOrEqual(0);
    expect(tareasIdx).toBeGreaterThan(correoIdx);
  });

  it("acciones secundarias visibles inline en desktop", () => {
    render(<HubQuickActions perms={perms()} />);
    expect(screen.getByText("Marcar Asistencia")).toBeTruthy();
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
