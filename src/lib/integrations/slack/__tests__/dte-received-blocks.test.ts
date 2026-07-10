import { describe, expect, it } from "vitest";
import {
  buildDteReceivedBlocks,
  buildDteReceivedText,
  renderDteBlocks,
  dteTypeLabel,
  MAX_INLINE,
  dteSecBlockId,
  dteActBlockId,
  type DteReceivedForBlocks,
} from "../dte-received-blocks";
import { replaceDteInMessage } from "../dte-received-message";

/* ── Helpers de inspección de bloques ── */

interface Block {
  type: string;
  block_id?: string;
  text?: { text?: string };
  elements?: Array<{ action_id?: string; value?: string; style?: string; confirm?: unknown }>;
}
const asBlocks = (b: unknown[]) => b as Block[];
const actionsOf = (blocks: Block[], id: string) =>
  blocks.find((b) => b.type === "actions" && b.block_id === dteActBlockId(id));
const actionIds = (blocks: Block[], id: string) =>
  (actionsOf(blocks, id)?.elements ?? []).map((e) => e.action_id);
const ctxText = (blocks: Block[]) =>
  blocks.filter((b) => b.type === "context").map((b) => JSON.stringify(b)).join(" ");

const pendingDte: DteReceivedForBlocks = {
  dteId: "dte-1",
  dteType: 33,
  folio: 1234,
  issuerName: "ACME SpA",
  issuerRut: "11.111.111-1",
  date: "2026-07-07",
  totalAmount: 434567,
  netAmount: 365182,
  taxAmount: 69385,
  receptionStatus: "PENDING_REVIEW",
  costCenterLabel: null,
};

describe("dteTypeLabel", () => {
  it("mapea los códigos SII a etiquetas legibles", () => {
    expect(dteTypeLabel(33)).toBe("Factura");
    expect(dteTypeLabel(34)).toBe("Factura Exenta");
    expect(dteTypeLabel(61)).toBe("Nota de Crédito");
    expect(dteTypeLabel(56)).toBe("Nota de Débito");
    expect(dteTypeLabel(39)).toBe("Boleta");
    expect(dteTypeLabel(41)).toBe("Boleta");
  });
});

describe("renderDteBlocks", () => {
  it("un DTE PENDING_REVIEW ofrece los 5 botones con confirm en Aceptar", () => {
    const blocks = asBlocks(renderDteBlocks(pendingDte));
    expect(actionIds(blocks, "dte-1")).toEqual([
      "dterecv_accept",
      "dterecv_claim_content",
      "dterecv_claim_partial",
      "dterecv_claim_total",
      "dterecv_costcenter",
    ]);
    const accept = actionsOf(blocks, "dte-1")!.elements!.find((e) => e.action_id === "dterecv_accept")!;
    expect(accept.style).toBe("primary");
    expect(accept.confirm).toBeTruthy();
    expect(accept.value).toBe("dte-1");
    // Sin centro de costo → lo dice el context.
    expect(ctxText(blocks)).toContain("Sin centro de costo");
  });

  it("un DTE ACCEPTED oculta los botones de reclamo (solo Centro de costo) y muestra ✅", () => {
    const blocks = asBlocks(renderDteBlocks({ ...pendingDte, receptionStatus: "ACCEPTED" }));
    expect(actionIds(blocks, "dte-1")).toEqual(["dterecv_costcenter"]);
    expect(ctxText(blocks)).toContain("✅ Aceptado");
  });

  it("muestra el centro de costo cuando ya está asignado", () => {
    const blocks = asBlocks(
      renderDteBlocks({ ...pendingDte, costCenterLabel: "Cliente X · Instalación Norte" }),
    );
    expect(ctxText(blocks)).toContain("Cliente X · Instalación Norte");
  });
});

describe("buildDteReceivedBlocks", () => {
  it("lista los DTEs con sus botones cuando el lote es chico", () => {
    const blocks = asBlocks(buildDteReceivedBlocks([pendingDte], "1 documento"));
    expect(actionIds(blocks, "dte-1")).toContain("dterecv_accept");
    expect(blocks[0].type).toBe("header");
  });

  it("lotes > MAX_INLINE colapsan a resumen sin botones por DTE", () => {
    const many = Array.from({ length: MAX_INLINE + 1 }, (_, i): DteReceivedForBlocks => ({
      ...pendingDte,
      dteId: `dte-${i}`,
      folio: 1000 + i,
    }));
    const blocks = asBlocks(buildDteReceivedBlocks(many, `${many.length} documentos`));
    expect(blocks.some((b) => b.type === "actions")).toBe(false);
    expect(JSON.stringify(blocks)).toContain("Recibidos");
  });
});

describe("buildDteReceivedText", () => {
  it("devuelve un fallback no vacío con tipo, folio y emisor", () => {
    const text = buildDteReceivedText([pendingDte]);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("F-1234");
    expect(text).toContain("ACME SpA");
  });
});

describe("replaceDteInMessage", () => {
  it("reemplaza solo el grupo del DTE objetivo, preservando el resto", () => {
    const otro: DteReceivedForBlocks = { ...pendingDte, dteId: "dte-2", folio: 5678 };
    const message = [
      { type: "header" },
      ...renderDteBlocks(pendingDte),
      ...renderDteBlocks(otro),
    ];
    const out = asBlocks(
      replaceDteInMessage(message, "dte-1", renderDteBlocks({ ...pendingDte, receptionStatus: "ACCEPTED" })),
    );
    // El DTE objetivo pasó a estado ACCEPTED (solo Centro de costo)…
    expect(actionIds(out, "dte-1")).toEqual(["dterecv_costcenter"]);
    expect(out.find((b) => b.block_id === dteSecBlockId("dte-1"))).toBeTruthy();
    // …y el otro DTE sigue intacto con sus 5 botones.
    expect(actionIds(out, "dte-2")).toContain("dterecv_claim_total");
  });
});
