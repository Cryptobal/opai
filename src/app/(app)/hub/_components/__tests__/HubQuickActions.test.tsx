import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubQuickActions } from "../HubQuickActions";
import type { HubPerms } from "../../_lib/hub-types";

function perms(overrides: Partial<HubPerms> = {}): HubPerms {
  return {
    hasCrm: true,
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
  it("Calendario visible directo en móvil con destino /opai/agenda", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    const links = Array.from(container.querySelectorAll('a[href="/opai/agenda"]'));
    // Tile móvil + botón desktop "Abrir calendario"
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Calendario")).toBeTruthy();
    expect(screen.getByText("Abrir calendario")).toBeTruthy();
  });

  it("Correos visible con destino /crm/correos", () => {
    const { container } = render(<HubQuickActions perms={perms()} />);
    expect(container.querySelectorAll('a[href="/crm/correos"]').length)
      .toBeGreaterThanOrEqual(2);
  });

  it("Crear abre el sheet existente (acciones secundarias no visibles directo)", () => {
    render(<HubQuickActions perms={perms()} />);
    expect(screen.getByText("Crear")).toBeTruthy();
    // La acción secundaria vive en el sheet (cerrado) y en el row desktop.
    const marcar = screen.getAllByText("Marcar Asistencia");
    expect(marcar.length).toBeGreaterThanOrEqual(1);
  });

  it("sin acceso CRM no muestra Calendario ni Correos", () => {
    const { container } = render(
      <HubQuickActions perms={perms({ hasCrm: false })} />,
    );
    expect(container.querySelector('a[href="/opai/agenda"]')).toBeNull();
    expect(container.querySelector('a[href="/crm/correos"]')).toBeNull();
  });

  it("sin CRM ni acciones → no renderiza nada", () => {
    const { container } = render(
      <HubQuickActions
        perms={perms({
          hasCrm: false,
          hasPersonas: false,
          canMarkAttendance: false,
        })}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
