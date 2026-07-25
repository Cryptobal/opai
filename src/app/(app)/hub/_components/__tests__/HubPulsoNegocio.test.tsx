import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HubPulsoNegocio } from '../HubPulsoNegocio';
import type {
  FinanceMetrics,
  FinanceCaps,
  HubPerms,
  TicketMetrics,
} from '../../_lib/hub-types';

function perms(overrides: Partial<HubPerms> = {}): HubPerms {
  return {
    hasCrm: false,
    hasAgenda: false,
    hasCorreos: false,
    hasTareas: false,
    hasDocs: false,
    hasFinance: true,
    hasOps: false,
    hasAts: false,
    hasPayroll: false,
    hasPersonas: false,
    canOpenLeads: false,
    canOpenDeals: false,
    canEditDeals: false,
    canOpenQuotes: false,
    canCreateProposal: false,
    canConfigureCrm: false,
    canApproveTE: false,
    canManageRefuerzos: false,
    canApproveRendicion: false,
    canMarkAttendance: false,
    hasSupervision: false,
    hasSupervisionCheckin: false,
    hasFinanceRendiciones: false,
    ...overrides,
  };
}

const caps: FinanceCaps = {
  banking_view: true,
  cashflow_view: false,
  purchases_view: true,
};

const tickets: TicketMetrics = {
  openCount: 0,
  inProgressCount: 0,
  resolvedTodayCount: 0,
  breachedCount: 0,
  p1PendingCount: 0,
  unassignedCount: 0,
  myAssignedActiveCount: 0,
  urgentTickets: [],
  moduleActive: true,
};

function financeMetrics(
  caja: FinanceMetrics['caja'],
  porCobrar: FinanceMetrics['porCobrar'],
): FinanceMetrics {
  return {
    pendingApprovalCount: 0,
    pendingApprovalAmount: 0,
    approvedUnpaidCount: 0,
    approvedUnpaidAmount: 0,
    caja,
    flujoSemana: null,
    dteMes: null,
    porCobrar,
  };
}

function renderPulso(fm: FinanceMetrics) {
  return render(
    <HubPulsoNegocio
      hubPerms={perms()}
      closingData={null}
      opsMetrics={null}
      financeMetrics={fm}
      financeCaps={caps}
      ticketMetrics={tickets}
    />,
  );
}

describe('HubPulsoNegocio — semántica de color', () => {
  it('caja negativa se pinta en danger (nunca verde), aunque el dato esté fresco', () => {
    renderPulso(
      financeMetrics(
        { totalClp: -11_000_000, asOfDate: '2026-07-25', staleDays: 1, perAccount: [] },
        null,
      ),
    );
    const value = screen.getByText('-$11M');
    expect(value).toHaveClass('text-status-danger-fg');
    expect(value).not.toHaveClass('text-status-ok-fg');
  });

  it('caja en cero es neutra (default), no verde', () => {
    renderPulso(
      financeMetrics(
        { totalClp: 0, asOfDate: '2026-07-25', staleDays: 1, perAccount: [] },
        null,
      ),
    );
    const value = screen.getByText('$0');
    expect(value).toHaveClass('text-ds-text-1');
    expect(value).not.toHaveClass('text-status-ok-fg');
  });

  it('caja positiva pero dato antiguo: valor en ok + aviso de antigüedad separado', () => {
    renderPulso(
      financeMetrics(
        { totalClp: 5_000_000, asOfDate: '2026-07-01', staleDays: 20, perAccount: [] },
        null,
      ),
    );
    expect(screen.getByText('$5.0M')).toHaveClass('text-status-ok-fg');
    // La antigüedad se comunica como aviso, no como color del valor.
    expect(screen.getByText(/Dato de hace 20d/)).toBeInTheDocument();
  });

  it('por cobrar: monto total neutro y chip de vencidas destacado', () => {
    renderPulso(
      financeMetrics(null, {
        totalAmount: 803_000_000,
        count: 5,
        vencidoAmount: 50_000_000,
        vencidoCount: 3,
      }),
    );
    const value = screen.getByText('$803M');
    // El monto total NO se pinta de rojo; el vencido va en su propio chip.
    expect(value).toHaveClass('text-ds-text-1');
    expect(value).not.toHaveClass('text-status-danger-fg');
    expect(screen.getByText(/3 vencidas/)).toBeInTheDocument();
  });

  it('por cobrar sin vencidas: sin chip de alerta', () => {
    renderPulso(
      financeMetrics(null, {
        totalAmount: 803_000_000,
        count: 5,
        vencidoAmount: 0,
        vencidoCount: 0,
      }),
    );
    expect(screen.getByText('$803M')).toHaveClass('text-ds-text-1');
    expect(screen.queryByText(/vencida/)).not.toBeInTheDocument();
  });
});
