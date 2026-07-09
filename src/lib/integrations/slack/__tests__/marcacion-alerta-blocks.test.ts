import { describe, expect, it } from "vitest";
import { buildMarcacionFueraRangoBlocks } from "../marcacion-alerta-blocks";

interface Block {
  type: string;
  elements?: Array<{ type?: string; text?: string }>;
}

const asBlocks = (blocks: unknown[]) => blocks as Block[];

describe("buildMarcacionFueraRangoBlocks", () => {
  it("incluye <!channel> al final y en el fallback text para notificar a todo el canal", () => {
    const { text, blocks } = buildMarcacionFueraRangoBlocks({
      guardiaName: "Juan Pérez",
      guardiaRut: "12.345.678-9",
      tipo: "entrada",
      installationName: "Polpaico",
      timestamp: new Date("2026-07-09T20:15:00.000Z"),
      geoDistanciaM: 450,
      geoRadiusM: 100,
      lat: -33.45,
      lng: -70.66,
      detailUrl: "https://www.opai.cl/ops/marcaciones",
    });

    expect(text).toContain("<!channel>");
    const ctxBlocks = asBlocks(blocks).filter((b) => b.type === "context");
    const lastCtx = ctxBlocks.at(-1);
    expect(lastCtx?.elements?.[0]?.text).toContain("<!channel>");
    expect(lastCtx?.elements?.[0]?.text).toContain("revisión de central");
  });
});
