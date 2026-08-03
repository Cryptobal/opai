import { describe, it, expect } from "vitest";
import {
  normalizeTipoDocRef,
  sanitizeBillingRefs,
  mergeBillingRefs,
  billingDraftReadToolDefinitions,
  billingDraftWriteToolDefinitions,
} from "@/lib/ai/help-chat-billing-draft-tools";
import {
  getToolDefinitionsV2,
  PREVIEW_TO_CONFIRM,
  WRITE_TOOL_NAMES,
} from "@/lib/ai/help-chat-tools-v2";

describe("normalizeTipoDocRef", () => {
  it("mapea OC / para pedido → 801", () => {
    expect(normalizeTipoDocRef("OC")).toBe("801");
    expect(normalizeTipoDocRef("801")).toBe("801");
    expect(normalizeTipoDocRef("orden de compra")).toBe("801");
    expect(normalizeTipoDocRef("Para pedido")).toBe("801");
    expect(normalizeTipoDocRef("PEDIDO")).toBe("801");
  });

  it("mapea HES / 802 → HES", () => {
    expect(normalizeTipoDocRef("HES")).toBe("HES");
    expect(normalizeTipoDocRef("802")).toBe("HES");
    expect(normalizeTipoDocRef("Hoja de entrada servicio")).toBe("HES");
  });
});

describe("sanitizeBillingRefs", () => {
  it("filtra inválidos y normaliza tipos", () => {
    const out = sanitizeBillingRefs([
      { tipoDocRef: "OC", folioRef: "4420005793", fchRef: "2026-07-01" },
      { tipoDocRef: "HES", folioRef: "1001252217", fchRef: "" },
      { tipoDocRef: "OC", folioRef: "", fchRef: "2026-07-01" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      tipoDocRef: "801",
      folioRef: "4420005793",
      fchRef: "2026-07-01",
    });
    expect(out[1]?.tipoDocRef).toBe("HES");
    expect(out[1]?.folioRef).toBe("1001252217");
    expect(out[1]?.fchRef).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("mergeBillingRefs", () => {
  it("merge reemplaza por tipo y conserva los demás", () => {
    const merged = mergeBillingRefs(
      [
        { tipoDocRef: "801", folioRef: "OLD-OC", fchRef: "2026-01-01" },
        { tipoDocRef: "803", folioRef: "CT-1", fchRef: "2026-01-01" },
      ],
      [
        { tipoDocRef: "801", folioRef: "4420005793", fchRef: "2026-07-15", razonRef: "" },
        { tipoDocRef: "HES", folioRef: "1001252217", fchRef: "2026-07-15", razonRef: "" },
      ],
      "merge",
    );
    expect(merged.find((r) => r.tipoDocRef === "801")?.folioRef).toBe("4420005793");
    expect(merged.find((r) => r.tipoDocRef === "HES")?.folioRef).toBe("1001252217");
    expect(merged.find((r) => r.tipoDocRef === "803")?.folioRef).toBe("CT-1");
  });

  it("replace deja solo las nuevas", () => {
    const merged = mergeBillingRefs(
      [{ tipoDocRef: "803", folioRef: "CT-1", fchRef: "2026-01-01" }],
      [{ tipoDocRef: "HES", folioRef: "1", fchRef: "2026-07-01", razonRef: "" }],
      "replace",
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.tipoDocRef).toBe("HES");
  });
});

describe("tool wiring", () => {
  it("expone tools de lectura y escritura en getToolDefinitionsV2", () => {
    const defs = getToolDefinitionsV2(true, true);
    const names = new Set(defs.map((d) => d.function.name));
    expect(names.has("search_invoice_drafts")).toBe(true);
    expect(names.has("search_recurring_invoices")).toBe(true);
    expect(names.has("preview_update_invoice_draft_refs")).toBe(true);
    expect(names.has("update_invoice_draft_refs")).toBe(true);
    expect(names.has("preview_update_recurring_invoice_refs")).toBe(true);
    expect(names.has("update_recurring_invoice_refs")).toBe(true);
  });

  it("mapea preview → confirm y marca writes", () => {
    expect(PREVIEW_TO_CONFIRM.preview_update_invoice_draft_refs?.confirmToolName).toBe(
      "update_invoice_draft_refs",
    );
    expect(PREVIEW_TO_CONFIRM.preview_update_recurring_invoice_refs?.confirmToolName).toBe(
      "update_recurring_invoice_refs",
    );
    expect(WRITE_TOOL_NAMES.has("update_invoice_draft_refs")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("update_recurring_invoice_refs")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("preview_update_invoice_draft_refs")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("search_invoice_drafts")).toBe(false);
  });

  it("definiciones locales tienen nombres esperados", () => {
    expect(billingDraftReadToolDefinitions().map((d) => d.function.name)).toEqual([
      "search_invoice_drafts",
      "search_recurring_invoices",
    ]);
    expect(billingDraftWriteToolDefinitions().map((d) => d.function.name)).toEqual([
      "preview_update_invoice_draft_refs",
      "update_invoice_draft_refs",
      "preview_update_recurring_invoice_refs",
      "update_recurring_invoice_refs",
    ]);
  });
});
