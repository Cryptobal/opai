import { describe, expect, it } from "vitest";
import { buildRelevoBlocks } from "../relevo-blocks";
import type { RelevoBoardData } from "@/lib/ops/relevo-board-data";

interface Block {
  type: string;
  text?: { text?: string };
  elements?: Array<{ type?: string; text?: { text?: string }; url?: string; action_id?: string }>;
}

const asBlocks = (blocks: unknown[]) => blocks as Block[];

const baseData: RelevoBoardData = {
  installationId: "inst-1",
  installationName: "Polpaico Norte",
  date: new Date("2026-07-10"),
  shiftStart: "08:00",
  turnoLabel: "Turno día",
  saliente: [],
  entrante: [
    {
      asistenciaId: "asist-1",
      nombre: "Carlos Muñoz",
      rut: "12.345.678-9",
      telefono: "+56 9 8765 4321",
      puesto: "Portería",
      estado: "pendiente",
      checkInAt: null,
      checkOutAt: null,
      contactoResultado: null,
    },
  ],
  cobertura: { cubiertos: 0, total: 1, ppc: 0 },
};

describe("buildRelevoBlocks", () => {
  it("muestra teléfono clickeable y botón WhatsApp bajo el guardia entrante", () => {
    const { blocks } = buildRelevoBlocks(baseData);
    const sections = asBlocks(blocks).filter((b) => b.type === "section");
    const entranteSection = sections.find((s) => s.text?.text?.includes("Carlos Muñoz"));
    expect(entranteSection?.text?.text).toContain("📞 <tel:+56987654321|+56 9 8765 4321>");

    const actions = asBlocks(blocks).find((b) => b.type === "actions" && b.elements?.some((e) => e.action_id === "asist_wa_asist-1"));
    const wa = actions?.elements?.find((e) => e.action_id === "asist_wa_asist-1");
    expect(wa?.url).toMatch(/^https:\/\/wa\.me\/56987654321\?text=/);
    expect(decodeURIComponent(wa?.url?.split("text=")[1] ?? "")).toContain("Hola Carlos");
    expect(decodeURIComponent(wa?.url?.split("text=")[1] ?? "")).toContain("Polpaico Norte");
    expect(decodeURIComponent(wa?.url?.split("text=")[1] ?? "")).toContain("Portería");
    expect(decodeURIComponent(wa?.url?.split("text=")[1] ?? "")).toContain("vas en camino");
    expect(decodeURIComponent(wa?.url?.split("text=")[1] ?? "")).toContain("gestionar el relevo");
  });

  it("no agrega WhatsApp si el guardia no tiene teléfono", () => {
    const { blocks } = buildRelevoBlocks({
      ...baseData,
      entrante: [{ ...baseData.entrante[0], telefono: null }],
    });
    const actions = asBlocks(blocks).find((b) => b.type === "actions" && b.block_id === "asist_row_asist-1");
    expect(actions?.elements?.some((e) => e.action_id?.startsWith("asist_wa_"))).toBe(false);
  });
});
