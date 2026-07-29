import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchParams = new URLSearchParams();
const loadMock = vi.fn(async () => {});
let toolbarRenders = 0;

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/opai/agenda",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../desktop/useAgendaDesktopData", () => ({
  useAgendaDesktopData: () => ({
    items: [],
    users: [],
    googleStatus: null,
    google: null,
    loading: false,
    load: loadMock,
    persistSchedule: vi.fn(),
  }),
}));

vi.mock("../desktop/useAgendaShortcuts", () => ({
  useAgendaShortcuts: () => {},
}));

vi.mock("../desktop/AgendaDesktopToolbar", () => ({
  AgendaDesktopToolbar: () => {
    toolbarRenders += 1;
    return <div data-testid="agenda-toolbar" />;
  },
}));

vi.mock("../desktop/AgendaRail", () => ({
  AgendaRail: () => <div data-testid="agenda-rail" />,
}));

vi.mock("../AgendaCalendarGrid", () => ({
  AgendaCalendarGrid: () => <div data-testid="agenda-grid" />,
}));

vi.mock("../AgendaInspector", () => ({
  AgendaInspector: () => null,
}));

vi.mock("../desktop/AgendaQuickCreate", () => ({
  AgendaQuickCreate: () => null,
}));

vi.mock("../NuevaVisitaModal", () => ({
  NuevaVisitaModal: () => null,
}));

vi.mock("../VisitDrawer", () => ({
  VisitDrawer: () => null,
}));

vi.mock("../LicitacionDrawer", () => ({
  LicitacionDrawer: () => null,
}));

import { AgendaDesktop } from "../desktop/AgendaDesktop";

describe("AgendaDesktop deep-link ?date=", () => {
  beforeEach(() => {
    toolbarRenders = 0;
    loadMock.mockClear();
    searchParams.delete("date");
    searchParams.delete("cal");
    searchParams.delete("nueva");
    searchParams.delete("visita");
    searchParams.delete("licitacion");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("monta con ?date=YYYY-MM-DD sin loop infinito (React #185)", async () => {
    searchParams.set("date", "2030-05-15");

    const { getByTestId } = render(
      <AgendaDesktop currentUserId="u1" userRole="owner" />,
    );

    await waitFor(() => {
      expect(getByTestId("agenda-grid")).toBeInTheDocument();
    });

    // Sin el guard, setAnchor(new Date) + load inestable re-renderiza sin techo.
    expect(toolbarRenders).toBeLessThan(20);
  });
});
