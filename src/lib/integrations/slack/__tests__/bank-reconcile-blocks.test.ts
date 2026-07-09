import { describe, expect, it } from "vitest";
import {
  buildBankMovementsBlocks,
  renderMovementBlocks,
  MAX_INLINE,
  secBlockId,
  actBlockId,
  type MovementForBlocks,
} from "../bank-reconcile-blocks";
import {
  resolvedMovementBlocks,
  replaceMovementInMessage,
} from "../bank-reconcile-message";

/* ── Helpers de inspección de bloques ── */

interface Block {
  type: string;
  block_id?: string;
  text?: { text?: string };
  elements?: Array<{ action_id?: string; value?: string; style?: string }>;
}
const asBlocks = (b: unknown[]) => b as Block[];
const actionsOf = (blocks: Block[], txId: string) =>
  blocks.find((b) => b.type === "actions" && b.block_id === actBlockId(txId));
const actionIds = (blocks: Block[], txId: string) =>
  (actionsOf(blocks, txId)?.elements ?? []).map((e) => e.action_id);
const ctxTextOf = (blocks: Block[]) =>
  blocks.filter((b) => b.type === "context").map((b) => JSON.stringify(b)).join(" ");

const cargo: MovementForBlocks = {
  bankTxId: "tx-cargo",
  transactionDate: "2026-07-07",
  description: "Pago proveedor ACME",
  amount: -434567,
  match: {
    dteId: "dte-1",
    folio: 1234,
    dteType: 33,
    direction: "RECEIVED",
    counterpartyName: "ACME SpA",
    amountPending: 434567,
  },
};

const abono: MovementForBlocks = {
  bankTxId: "tx-abono",
  transactionDate: "2026-07-08",
  description: "Cobro cliente Cointer",
  amount: 800000,
  match: null,
};

describe("buildBankMovementsBlocks", () => {
  it("cargo con match ofrece botón directo primary + Otra cuenta y copy de compra", () => {
    const blocks = asBlocks(buildBankMovementsBlocks({ summary: "2 movimientos", accountLabel: "Santander", movements: [cargo] }));
    expect(actionIds(blocks, "tx-cargo")).toEqual(["bankreconc_confirm", "bankreconc_manual"]);

    const confirm = actionsOf(blocks, "tx-cargo")!.elements!.find((e) => e.action_id === "bankreconc_confirm")!;
    expect(confirm.style).toBe("primary");
    expect(JSON.parse(confirm.value!)).toEqual({ txId: "tx-cargo", dteId: "dte-1" });
    // El botón "Otra cuenta" lleva solo el txId.
    const manual = actionsOf(blocks, "tx-cargo")!.elements!.find((e) => e.action_id === "bankreconc_manual")!;
    expect(manual.value).toBe("tx-cargo");
    // Copy de dirección: cargo → compra.
    expect(ctxTextOf(blocks)).toContain("compra");
    expect(ctxTextOf(blocks)).toContain("F-1234");
  });

  it("abono con match usa copy de venta", () => {
    const abonoMatch: MovementForBlocks = { ...abono, match: { ...cargo.match!, direction: "ISSUED", counterpartyName: "Cointer" } };
    const blocks = asBlocks(buildBankMovementsBlocks({ summary: "s", accountLabel: "S", movements: [abonoMatch] }));
    expect(ctxTextOf(blocks)).toContain("venta");
  });

  it("movimiento sin match solo ofrece Asignar cuenta contable", () => {
    const blocks = asBlocks(buildBankMovementsBlocks({ summary: "s", accountLabel: "S", movements: [abono] }));
    expect(actionIds(blocks, "tx-abono")).toEqual(["bankreconc_manual"]);
  });

  it("lotes > MAX_INLINE colapsan a resumen sin botones por movimiento", () => {
    const many = Array.from({ length: MAX_INLINE + 1 }, (_, i): MovementForBlocks => ({
      bankTxId: `tx-${i}`,
      transactionDate: "2026-07-07",
      description: `mov ${i}`,
      amount: -1000 * (i + 1),
      match: null,
    }));
    const blocks = asBlocks(buildBankMovementsBlocks({ summary: "13 movimientos", accountLabel: "S", movements: many }));
    expect(blocks.some((b) => b.type === "actions")).toBe(false);
    expect(JSON.stringify(blocks)).toContain("Bancos → Movimientos");
  });
});

describe("resolvedMovementBlocks + replaceMovementInMessage", () => {
  it("estado resuelto incluye botón Deshacer cuando hay pendingId", () => {
    const blocks = asBlocks(resolvedMovementBlocks("tx-cargo", "Conciliado", "pending-1"));
    const undo = blocks.find((b) => b.type === "actions")?.elements?.[0];
    expect(undo?.action_id).toBe("bankreconc_undo");
    expect(undo?.value).toBe("pending-1");
    expect(blocks[0].text?.text).toContain("✅");
  });

  it("sin pendingId no agrega botón (estado terminal, p.ej. colisión)", () => {
    const blocks = asBlocks(resolvedMovementBlocks("tx-cargo", "Ya conciliado", null));
    expect(blocks.some((b) => b.type === "actions")).toBe(false);
  });

  it("reemplaza solo el grupo del movimiento objetivo, preservando el resto", () => {
    const message = [
      { type: "header", block_id: undefined },
      ...renderMovementBlocks(cargo),
      ...renderMovementBlocks(abono),
    ];
    const out = asBlocks(replaceMovementInMessage(message, "tx-cargo", resolvedMovementBlocks("tx-cargo", "Conciliado", "p1")));
    // El grupo del cargo ya no tiene sus botones originales, ahora solo Deshacer…
    expect(actionIds(out, "tx-cargo")).toEqual(["bankreconc_undo"]);
    expect(out.find((b) => b.block_id === secBlockId("tx-cargo"))?.text?.text).toContain("Conciliado");
    // …y el movimiento abono sigue intacto con su botón manual.
    expect(actionIds(out, "tx-abono")).toEqual(["bankreconc_manual"]);
  });

  it("deshacer re-renderiza el mov pendiente sin dejar botón Deshacer huérfano", () => {
    // Estado tras conciliar: section ✓ + botón Deshacer (usando actBlockId).
    const resolved = resolvedMovementBlocks("tx-cargo", "Conciliado", "pend-1");
    const message = [{ type: "header" }, ...resolved];
    // Undo re-renderiza el movimiento a su estado pendiente.
    const out = asBlocks(replaceMovementInMessage(message, "tx-cargo", renderMovementBlocks({ ...cargo, match: null })));
    // El botón bankreconc_undo desaparece; queda el botón manual del pendiente.
    expect(JSON.stringify(out)).not.toContain("bankreconc_undo");
    expect(actionIds(out, "tx-cargo")).toEqual(["bankreconc_manual"]);
  });
});
