import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import type { GrillaPayload } from "@/lib/supervision-grilla";
import { getInitials } from "@/lib/supervision-grilla";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ops/supervision",
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function visit(partial: GrillaPayload["visits"][number]): GrillaPayload["visits"][number] {
  return partial;
}

const payload: GrillaPayload = {
  year: 2026,
  month: 8,
  daysInMonth: 31,
  today: { year: 2026, month: 8, day: 25 },
  installations: [
    {
      id: "inst-a",
      name: "Mall Centro",
      openFindings: 2,
      nocturnoEnabled: true,
      assignmentWindows: [{ start: "2026-08-01", end: null }],
    },
    {
      id: "inst-b",
      name: "Bodega Norte",
      openFindings: 0,
      nocturnoEnabled: false,
      assignmentWindows: [{ start: "2026-08-01", end: null }],
    },
    {
      id: "inst-c",
      name: "Sitio sin visita",
      openFindings: 0,
      nocturnoEnabled: false,
      assignmentWindows: [{ start: "2026-08-01", end: null }],
    },
    {
      id: "inst-n",
      name: "Faena nocturna",
      openFindings: 0,
      nocturnoEnabled: true,
      assignmentWindows: [{ start: "2026-08-01", end: null }],
    },
  ],
  visits: [
    visit({
      id: "d1",
      installationId: "inst-a",
      day: 10,
      supervisorName: "Ana Bravo",
      initials: getInitials("Ana Bravo"),
      checkInAt: "2026-08-10T12:00:00.000Z",
      checkOutAt: "2026-08-10T13:42:00.000Z",
      durationMinutes: 102,
      durationLabel: "1 h 42 min",
      shift: "day",
      crossedShift: false,
      shortVisit: false,
      noCheckout: false,
      outsideGeofence: false,
      status: "completed",
      findingCount: 1,
    }),
    visit({
      id: "d2",
      installationId: "inst-a",
      day: 10,
      supervisorName: "Carlos Diaz",
      initials: getInitials("Carlos Diaz"),
      checkInAt: "2026-08-10T14:00:00.000Z",
      checkOutAt: "2026-08-10T14:40:00.000Z",
      durationMinutes: 40,
      durationLabel: "40 min",
      shift: "day",
      crossedShift: false,
      shortVisit: false,
      noCheckout: false,
      outsideGeofence: false,
      status: "completed",
      findingCount: 0,
    }),
    visit({
      id: "n1",
      installationId: "inst-a",
      day: 10,
      supervisorName: "Eva Ruiz",
      initials: getInitials("Eva Ruiz"),
      checkInAt: "2026-08-11T01:00:00.000Z",
      checkOutAt: "2026-08-11T02:30:00.000Z",
      durationMinutes: 90,
      durationLabel: "1 h 30 min",
      shift: "night",
      crossedShift: false,
      shortVisit: false,
      noCheckout: false,
      outsideGeofence: false,
      status: "completed",
      findingCount: 0,
    }),
    visit({
      id: "b1",
      installationId: "inst-b",
      day: 11,
      supervisorName: "Ana Bravo",
      initials: getInitials("Ana Bravo"),
      checkInAt: "2026-08-11T12:00:00.000Z",
      checkOutAt: "2026-08-11T13:00:00.000Z",
      durationMinutes: 60,
      durationLabel: "1 h",
      shift: "day",
      crossedShift: false,
      shortVisit: false,
      noCheckout: false,
      outsideGeofence: false,
      status: "completed",
      findingCount: 0,
    }),
  ],
  incidents: [
    {
      id: "inc-1",
      installationId: "inst-a",
      day: 10,
      shift: "day",
      status: "open",
      title: "Intrusión en acceso",
      code: "INC-1",
    },
    {
      id: "inc-2",
      installationId: "inst-a",
      day: 12,
      shift: "night",
      status: "in_progress",
      title: "Alarma perimetral",
      code: "INC-2",
    },
    {
      id: "inc-3",
      installationId: "inst-b",
      day: 11,
      shift: "day",
      status: "resolved",
      title: "Cierre por validar",
      code: "INC-3",
    },
  ],
};

function mockMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("SupervisionGrilla", () => {
  beforeEach(() => {
    mockMatchMedia();
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/ops/supervision/grilla/day")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                installation: { id: "inst-a", name: "Mall Centro" },
                year: 2026,
                month: 8,
                day: 10,
                visits: payload.visits.filter((v) => v.installationId === "inst-a" && v.day === 10),
                incidents: payload.incidents.filter((i) => i.installationId === "inst-a" && i.day === 10),
                findings: [
                  {
                    id: "f1",
                    visitId: "d1",
                    category: "operational",
                    severity: "major",
                    description: "Libro de novedades atrasado",
                    status: "open",
                  },
                ],
              },
            }),
          };
        }
        if (url.includes("/api/ops/supervision/grilla")) {
          return {
            ok: true,
            json: async () => ({ success: true, data: payload }),
          };
        }
        return { ok: false, json: async () => ({ success: false }) };
      }),
    );
  });

  it("Día / Noche / Ambas cambian celdas, Vis. y Hrs.; el incidente se ve en celda, Inc. y detalle", async () => {
    const { SupervisionGrilla } = await import("../SupervisionGrilla");
    render(<SupervisionGrilla year={2026} month={8} />);

    await waitFor(() => {
      expect(screen.getByText("Mall Centro")).toBeTruthy();
    });

    expect(screen.getByText("Incidentes en terreno")).toBeTruthy();
    expect(screen.getByText(/visita es el check-in/i)).toBeTruthy();

    const mallRow = screen.getByText("Mall Centro").closest("tr")!;
    const cells = mallRow.querySelectorAll("td");
    // name | 31 days | Hall | Inc | Vis | Hrs
    expect(cells).toHaveLength(36);
    expect(cells[32].textContent).toContain("2"); // Hall.
    expect(cells[33].textContent).toContain("2"); // Inc. open+in_progress
    expect(cells[34].textContent).toBe("3"); // Vis. ambas
    expect(cells[35].textContent).toBe("3,9"); // Hrs.

    const day10 = cells[10]; // day 10 is the 11th td (index 10)
    expect(day10.textContent).toContain("3");
    expect(day10.querySelector(".bg-status-danger")).toBeTruthy();

    fireEvent.mouseEnter(day10.querySelector("button")!);
    await waitFor(() => {
      expect(screen.getByText("Ana Bravo")).toBeTruthy();
      expect(screen.getByText(/1 h 42 min/)).toBeTruthy();
      expect(screen.getByText("Carlos Diaz")).toBeTruthy();
      expect(screen.getByText("Eva Ruiz")).toBeTruthy();
      expect(screen.getByText(/INC-1/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Día/ }));
    await waitFor(() => {
      const row = screen.getByText("Mall Centro").closest("tr")!;
      const tds = row.querySelectorAll("td");
      expect(tds[34].textContent).toBe("2");
      expect(tds[35].textContent).toBe("2,4");
      expect(tds[33].textContent).toContain("1");
    });

    fireEvent.click(screen.getByRole("tab", { name: /Noche/ }));
    await waitFor(() => {
      const row = screen.getByText("Mall Centro").closest("tr")!;
      const tds = row.querySelectorAll("td");
      expect(tds[34].textContent).toBe("1");
      expect(tds[35].textContent).toBe("1,5");
      expect(tds[10].textContent).toContain("ER");
      // incidente nocturno del día 12, sin visita
      expect(tds[12].querySelector(".bg-status-danger")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Ambas/ }));
    const day10Btn = screen.getByText("Mall Centro").closest("tr")!.querySelectorAll("td")[10].querySelector("button")!;
    fireEvent.click(day10Btn);
    await waitFor(() => {
      expect(screen.getByText("Libro de novedades atrasado")).toBeTruthy();
      expect(screen.getByText("Intrusión en acceso")).toBeTruthy();
    });
  });

  it("KPI Sin noche filtra el sitio que exige noche y no la tiene; asignación incumplida ≠ sin visita", async () => {
    const { SupervisionGrilla } = await import("../SupervisionGrilla");
    render(<SupervisionGrilla year={2026} month={8} />);
    await waitFor(() => expect(screen.getByText("Faena nocturna")).toBeTruthy());

    const faena = screen.getByText("Faena nocturna").closest("tr")!;
    const empty = screen.getByText("Sitio sin visita").closest("tr")!;
    const bodega = screen.getByText("Bodega Norte").closest("tr")!;
    const mall = screen.getByText("Mall Centro").closest("tr")!;

    expect(within(faena).getByLabelText(/exige visita nocturna y este mes no la tiene/i)).toBeTruthy();
    expect(within(faena).getByText("Sin noche")).toBeTruthy();
    expect(within(mall).getByLabelText(/exige visita nocturna; este mes ya tiene/i)).toBeTruthy();
    expect(within(mall).getByText("Noche")).toBeTruthy();
    expect(within(bodega).queryByText("Noche")).toBeNull();
    expect(within(bodega).queryByText("Sin noche")).toBeNull();
    expect(empty.querySelector("[title='Asignación sin ejecución']")).toBeTruthy();
    expect(bodega.querySelector("[title='Asignación sin ejecución']")).toBeFalsy();
    expect(screen.getByText(/Sitio que exige visita nocturna/)).toBeTruthy();
    expect(screen.getByText(/este mes todavía no la tiene/)).toBeTruthy();

    fireEvent.click(screen.getByText("Sin noche"));
    await waitFor(() => {
      expect(screen.getByText("Faena nocturna")).toBeTruthy();
      expect(screen.queryByText("Bodega Norte")).toBeNull();
    });
  });
});
