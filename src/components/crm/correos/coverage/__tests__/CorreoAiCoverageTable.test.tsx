import { describe, expect, it, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CorreoAiCoverageTable } from "../../CorreoAiCoverageTable";
import { recalcProposalStaffing } from "../../plan/staffing-local";
import type {
  CrmStructureInstallation,
  CrmStructureProposal,
} from "@/modules/crm/email/email-to-crm-structure.types";
import { emptyCrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";

vi.mock("@/components/ui/simple-select", () => ({
  SimpleSelect: ({
    value,
    options,
  }: {
    value?: string;
    options?: Array<{ value: string; label: string }>;
  }) => (
    <select data-testid="simple-select" defaultValue={value}>
      {(options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/cpq/use-cpq-catalogs", () => ({
  useCpqCatalogs: () => ({ puestos: [], cargos: [], roles: [] }),
  refreshCpqCatalogs: vi.fn(),
}));

vi.mock("@/components/cpq/position-matrix/useLiquidoPreview", () => ({
  useLiquidoPreview: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function baseProposal(
  overrides: Partial<CrmStructureProposal> = {},
): CrmStructureProposal {
  return { ...emptyCrmStructureProposal(), ...overrides };
}

/** Expande la tarjeta de instalación (contraída por defecto). No-op si ya está abierta. */
function expandInstallation(name: string) {
  const btn = screen.getByRole("button", { name: new RegExp(name, "i") });
  if (btn.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(btn);
  }
}

const week = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

describe("CorreoAiCoverageTable", () => {
  afterEach(() => cleanup());

  it("tarjeta por instalación con etapas anidadas, peak y chips", () => {
    const proposal = baseProposal({
      staffingTotals: {
        weeklyHH: 500,
        headcountBase: 20,
        reserveHeadcount: 2,
        headcountWithReserve: 22,
        legalMinimum: 12,
      },
      staffingPeak: {
        peakHeadcount: 16,
        peakWeeklyHH: 400,
        peakFrom: "2026-11-15",
        peakTo: "2026-11-30",
      },
      installations: [
        {
          name: "Obra",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [
            {
              name: "Pique diurno",
              role: null,
              regimen: "Diurno",
              dias: week,
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
              notes: null,
              weeklyHH: 84,
              headcount: 2,
              pattern: "4x4",
              staffingRationale: "",
              etapa: "Etapa 1",
              vigenciaDesde: "2026-09-01",
              vigenciaHasta: "2026-09-30",
              horarioAsumido: true,
            },
            {
              name: "Rondín nocturno",
              role: null,
              regimen: "Rondín",
              dias: week,
              horaInicio: "20:00",
              horaFin: "08:00",
              simultaneous: 1,
              notes: null,
              weeklyHH: 0,
              headcount: 1,
              pattern: "parcial",
              staffingRationale: "",
              etapa: "Etapa 1",
              vigenciaDesde: "2026-09-01",
              vigenciaHasta: "2026-09-30",
            },
            {
              name: "Guardia 3A",
              role: null,
              regimen: "24/7",
              dias: week,
              horaInicio: "08:00",
              horaFin: "20:00",
              simultaneous: 1,
              notes: null,
              weeklyHH: 84,
              headcount: 2,
              pattern: "4x4",
              staffingRationale: "",
              etapa: "Etapa 3A",
              vigenciaDesde: "2026-10-01",
              vigenciaHasta: "2026-11-30",
            },
          ],
        },
      ],
    });

    render(<CorreoAiCoverageTable proposal={proposal} onChange={() => {}} />);

    expect(screen.getByText("Obra")).toBeTruthy();
    expect(screen.getByText("Peak simultáneo")).toBeTruthy();
    expect(screen.getByText("Σ etapas, no simultáneo")).toBeTruthy();
    expect(screen.getByText("Timeline de etapas")).toBeTruthy();
    // Instalación contraída: el detalle de etapas/puestos aparece al expandir.
    expect(screen.queryByText("horario asumido")).toBeNull();
    expandInstallation("Obra");
    expect(screen.getAllByText("Etapa 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Etapa 3A").length).toBeGreaterThan(0);
    expect(screen.getByText("horario asumido")).toBeTruthy();
    expect(screen.getByText("rondín")).toBeTruthy();
    expect(screen.getAllByText(/Puesto en esta etapa/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Puesto en esta instalación/)).toBeTruthy();
  });

  it("draft legacy: tarjeta de instalación con puesto plano, sin peak ni timeline", () => {
    const proposal = baseProposal({
      staffingTotals: {
        weeklyHH: 40,
        headcountBase: 2,
        reserveHeadcount: 0,
        headcountWithReserve: 2,
        legalMinimum: 1,
      },
      staffingPeak: null,
      installations: [
        {
          name: "Planta",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [
            {
              name: "Portería",
              role: null,
              regimen: "4x4",
              dias: week.slice(0, 5),
              horaInicio: "08:00",
              horaFin: "18:00",
              simultaneous: 1,
              notes: null,
              weeklyHH: 50,
              headcount: 2,
              pattern: "pool_42h",
              staffingRationale: "",
            },
          ],
        },
      ],
    });

    render(<CorreoAiCoverageTable proposal={proposal} />);

    expect(screen.getByText("Planta")).toBeTruthy();
    expect(screen.queryByText("Peak simultáneo")).toBeNull();
    expect(screen.queryByText("Timeline de etapas")).toBeNull();
    // Puesto contraído dentro de instalación contraída: abrir instalación.
    expect(screen.queryByText("Portería")).toBeNull();
    expandInstallation("Planta");
    expect(screen.getByText("Portería")).toBeTruthy();
  });

  it("agregar puesto cae en la instalación correcta con nombre y foco", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    let installations: CrmStructureInstallation[] = [];
    const initial = baseProposal({
      installations: [
        {
          name: "Planta",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [],
        },
      ],
    });

    function Harness() {
      const [p, setP] = useState<CrmStructureProposal>(initial);
      return (
        <CorreoAiCoverageTable
          proposal={p}
          onChange={(next, opts) => {
            const patched = { ...p, installations: next };
            const committed =
              opts?.recalc === false ? patched : recalcProposalStaffing(patched);
            installations = committed.installations;
            setP(committed);
          }}
        />
      );
    }

    render(<Harness />);
    expandInstallation("Planta");
    fireEvent.click(screen.getByText(/Puesto en esta instalación/));

    const nameInput = screen.getByLabelText("Nombre del puesto") as HTMLInputElement;
    expect(nameInput.value).toBe("Puesto 1");
    expect(document.activeElement).toBe(nameInput);
    expect(installations[0].coverageSlots).toHaveLength(1);
    expect(installations[0].coverageSlots[0].headcount).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: "Portería norte" } });
    const after = screen.getByLabelText("Nombre del puesto") as HTMLInputElement;
    expect(after.value).toBe("Portería norte");
    expect(document.activeElement).toBe(after);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("sin instalaciones de la IA permite agregar puesto a mano", () => {
    const proposal = baseProposal({ installations: [] });
    const onChange = vi.fn();
    render(<CorreoAiCoverageTable proposal={proposal} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Puesto en General/));
    const next = onChange.mock.calls[0][0] as CrmStructureInstallation[];
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("Instalación principal");
    expect(next[0].coverageSlots).toHaveLength(1);
    expect(next[0].coverageSlots[0].name).toBe("Puesto 1");
  });

  it("segundo puesto en la instalación numera correlativo", () => {
    const proposal = baseProposal({
      installations: [
        {
          name: "Planta",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [],
        },
      ],
    });
    const onChange = vi.fn();
    const { rerender } = render(
      <CorreoAiCoverageTable proposal={proposal} onChange={onChange} />,
    );
    expandInstallation("Planta");
    fireEvent.click(screen.getByText(/Puesto en esta instalación/));
    const first = onChange.mock.calls[0][0] as CrmStructureInstallation[];
    expect(first[0].coverageSlots[0].name).toBe("Puesto 1");

    rerender(
      <CorreoAiCoverageTable
        proposal={{ ...proposal, installations: first }}
        onChange={onChange}
      />,
    );
    // Tras rerender la instalación vuelve contraída (estado local inicial).
    expandInstallation("Planta");
    fireEvent.click(screen.getByText(/Puesto en esta instalación/));
    const second = onChange.mock.calls[1][0] as CrmStructureInstallation[];
    expect(second[0].coverageSlots.map((s) => s.name)).toEqual([
      "Puesto 1",
      "Puesto 2",
    ]);
  });

  it("mover puesto entre instalaciones recalcula subtotales en tarjetas", () => {
    const slotA = {
      name: "A",
      role: null,
      regimen: "4x4",
      dias: week,
      horaInicio: "08:00",
      horaFin: "20:00",
      simultaneous: 1,
      notes: null,
      weeklyHH: 100,
      headcount: 4,
      pattern: "4x4",
      staffingRationale: "",
    };
    const slotB = {
      ...slotA,
      name: "B",
      weeklyHH: 50,
      headcount: 2,
    };
    const proposal = baseProposal({
      installations: [
        {
          name: "Planta",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [slotA],
        },
        {
          name: "Centro",
          address: null,
          commune: null,
          city: null,
          mapsUrl: null,
          coverageSlots: [slotB],
        },
      ],
    });
    const onChange = vi.fn();
    render(<CorreoAiCoverageTable proposal={proposal} onChange={onChange} />);

    expect(screen.getByText(/1 puestos · 100 HH\/sem · 4/)).toBeTruthy();
    expect(screen.getByText(/1 puestos · 50 HH\/sem · 2/)).toBeTruthy();

    // Abrir Planta, expandir el puesto A y moverlo a Centro.
    expandInstallation("Planta");
    fireEvent.click(screen.getByRole("button", { name: /Día\s+A\b/i }));
    const moveBtns = screen.getAllByLabelText("Mover a otra instalación");
    fireEvent.click(moveBtns[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Centro" })[0]);

    const next = onChange.mock.calls[0][0] as CrmStructureInstallation[];
    expect(next[0].coverageSlots).toHaveLength(0);
    expect(next[1].coverageSlots.map((s) => s.name)).toEqual(["B", "A"]);
  });
});
