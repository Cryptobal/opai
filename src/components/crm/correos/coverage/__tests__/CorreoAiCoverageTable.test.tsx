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

function baseProposal(
  overrides: Partial<CrmStructureProposal> = {},
): CrmStructureProposal {
  return { ...emptyCrmStructureProposal(), ...overrides };
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

  it("agrupa por etapa, muestra peak y chips en draft multi-etapa", () => {
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

    expect(screen.getAllByText("Etapa 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Etapa 3A").length).toBeGreaterThan(0);
    expect(screen.getByText("Peak simultáneo")).toBeTruthy();
    expect(screen.getByText("Σ etapas, no simultáneo")).toBeTruthy();
    expect(screen.getByText("horario asumido")).toBeTruthy();
    expect(screen.getByText("rondín")).toBeTruthy();
    expect(screen.getByText("Timeline de etapas")).toBeTruthy();
    expect(screen.getAllByText(/Puesto en esta etapa/).length).toBeGreaterThan(0);
  });

  it("draft legacy: grupo General, sin peak ni timeline", () => {
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

    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.queryByText("Peak simultáneo")).toBeNull();
    expect(screen.queryByText("Timeline de etapas")).toBeNull();
    expect(screen.getByText("Portería")).toBeTruthy();
  });

  it("agregar puesto: fila persistente con nombre por defecto, foco y sin red", () => {
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
            // Igual que CorreoAiActionPanel: recálculo local, cero red.
            const committed =
              opts?.recalc === false ? patched : recalcProposalStaffing(patched);
            installations = committed.installations;
            setP(committed);
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByText(/Puesto en General/));

    // La fila sobrevive al commit (antes la borraba el recalc por red).
    const nameInput = screen.getByLabelText("Nombre del puesto") as HTMLInputElement;
    expect(nameInput.value).toBe("Puesto 1");
    expect(document.activeElement).toBe(nameInput);
    expect(installations[0].coverageSlots).toHaveLength(1);
    // Dotación calculada en cliente: L-D 08–20 → 4x4, 2 personas.
    expect(installations[0].coverageSlots[0].headcount).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Tipear no remonta la fila: el input conserva el foco.
    fireEvent.change(nameInput, { target: { value: "Portería norte" } });
    const after = screen.getByLabelText("Nombre del puesto") as HTMLInputElement;
    expect(after.value).toBe("Portería norte");
    expect(document.activeElement).toBe(after);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("segundo puesto en el grupo numera correlativo", () => {
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
    fireEvent.click(screen.getByText(/Puesto en General/));
    const first = onChange.mock.calls[0][0] as CrmStructureInstallation[];
    expect(first[0].coverageSlots[0].name).toBe("Puesto 1");

    rerender(
      <CorreoAiCoverageTable
        proposal={{ ...proposal, installations: first }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText(/Puesto en esta etapa/));
    const second = onChange.mock.calls[1][0] as CrmStructureInstallation[];
    expect(second[0].coverageSlots.map((s) => s.name)).toEqual([
      "Puesto 1",
      "Puesto 2",
    ]);
  });
});
