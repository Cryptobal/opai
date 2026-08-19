import { describe, expect, it } from "vitest";
import { emptyProposalV2 } from "../schema";
import { setSectionContent } from "../ops";
import {
  hydrateProposalContentForPdf,
  isPlaceholderExclusionesContent,
} from "../hydrate-for-pdf";
import {
  buildDotacionContentForInstallations,
  type DotacionPosition,
} from "../build-dotacion";
import { GARD_FIXED_SECTION_SEEDS } from "@/lib/cpq/fixed-sections";

const fixedRows = GARD_FIXED_SECTION_SEEDS.map((seed) => ({
  key: seed.key,
  title: seed.title,
  content: seed.content,
}));

function samplePosition(over: Partial<DotacionPosition> = {}): DotacionPosition {
  return {
    customName: "Control de Acceso",
    weekdays: ["lun", "mar", "mie", "jue", "vie", "sab", "dom"],
    startTime: "08:00",
    endTime: "20:00",
    numGuards: 2,
    numPuestos: 1,
    puestoTrabajo: { name: "Control de Acceso" },
    cargo: { name: "Guardia" },
    rol: null,
    serviceGroup: { name: "Control de acceso 24/7", displayOrder: 0 },
    ...over,
  };
}

describe("hydrateProposalContentForPdf", () => {
  it("rellena fija_empresa y Dotación vacías desde biblioteca + puestos", () => {
    const content = emptyProposalV2("comercial");
    const result = hydrateProposalContentForPdf({
      content,
      fixedSections: fixedRows,
      positions: [samplePosition()],
    });

    expect(result.changed).toBe(true);
    const byTitle = Object.fromEntries(
      result.content.sections.map((s) => [s.title, s.content]),
    );
    expect(byTitle["Quiénes somos y organigrama"]).toMatch(/Gard Security/);
    expect(byTitle["Uniformes y EPP"]).toMatch(/uniforme/i);
    expect(byTitle["OPAI y SLA"]).toMatch(/OPAI/);
    expect(byTitle["Dotación"]).toMatch(/Control de Acceso/);
    expect(byTitle["Dotación"]).toMatch(/4 guardias|2 guardias/);
    // Gantt (ia) no se inventa sin generate
    expect(byTitle["Carta Gantt"]?.trim() ?? "").toBe("");
  });

  it("no pisa secciones editadas a mano aunque estén vacías", () => {
    let content = emptyProposalV2("comercial");
    const uniformes = content.sections.find((s) => s.title === "Uniformes y EPP")!;
    content = setSectionContent(content, uniformes.id, "", { mark: "editada" });

    const result = hydrateProposalContentForPdf({
      content,
      fixedSections: fixedRows,
      positions: [samplePosition()],
    });

    const u = result.content.sections.find((s) => s.title === "Uniformes y EPP")!;
    expect(u.content.trim()).toBe("");
    expect(u.status).toBe("editada");
  });

  it("Dotación multi-instalación usa installations[]", () => {
    const content = emptyProposalV2("comercial");
    const result = hydrateProposalContentForPdf({
      content,
      fixedSections: fixedRows,
      installations: [
        { name: "S/E Charrúa", positions: [samplePosition({ numGuards: 2 })] },
        {
          name: "S/E Ancoa",
          positions: [
            samplePosition({
              numGuards: 2,
              startTime: "20:00",
              endTime: "08:00",
              serviceGroup: { name: "Control nocturno", displayOrder: 1 },
            }),
          ],
        },
      ],
    });

    const dotacion = result.content.sections.find((s) => s.title === "Dotación")!.content;
    expect(dotacion).toContain("S/E Charrúa");
    expect(dotacion).toContain("S/E Ancoa");
    expect(dotacion).toMatch(/consolidada/i);
  });
});

describe("buildDotacionContentForInstallations", () => {
  it("una instalación delega al builder mono", () => {
    const body = buildDotacionContentForInstallations([
      { name: "Solo una", positions: [samplePosition()] },
    ]);
    expect(body).toContain("Dotación considerada");
    expect(body).not.toMatch(/consolidada/i);
  });
});

describe("isPlaceholderExclusionesContent", () => {
  it("detecta stubs comerciales y de licitación", () => {
    expect(isPlaceholderExclusionesContent("Pendiente de completar.")).toBe(true);
    expect(isPlaceholderExclusionesContent("Pendiente: se completará con lo no cubierto")).toBe(
      true,
    );
    expect(isPlaceholderExclusionesContent("Fuera de alcance: obra civil.")).toBe(false);
  });
});
