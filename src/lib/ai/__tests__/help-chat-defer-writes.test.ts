import { describe, expect, it } from "vitest";
import { decideWriteDeferral, shouldDeferWrite } from "@/lib/ai/help-chat-defer-writes";
import { WRITE_TOOL_NAMES } from "@/lib/ai/help-chat-tools-v2";

describe("help-chat-defer-writes", () => {
  it("diferir update_installation cuando allowWrites", () => {
    expect(shouldDeferWrite("update_installation", { id: "x", status: "inactive" }, true)).toBe(true);
    const d = decideWriteDeferral({
      toolName: "update_installation",
      args: { id: "x", status: "inactive" },
      allowWrites: true,
      pendingCount: 0,
    });
    expect(d.kind).toBe("defer");
    if (d.kind === "defer") {
      expect(d.pending.confirmToolName).toBe("update_installation");
      expect(d.toolResult.status).toBe("pending_confirmation");
    }
  });

  it("no diferir lecturas", () => {
    expect(shouldDeferWrite("search_installations", { query: "a" }, true)).toBe(false);
  });

  it("no diferir search_emails ni resolve_entity/mailbox_coverage/count_emails", () => {
    expect(WRITE_TOOL_NAMES.has("search_emails")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("search_emails_semantic")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("count_emails")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("resolve_entity")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("mailbox_coverage")).toBe(false);
    expect(shouldDeferWrite("search_emails", { query: "acuda" }, true)).toBe(false);
    expect(shouldDeferWrite("search_emails_semantic", { query: "acuda" }, true)).toBe(false);
    expect(shouldDeferWrite("count_emails", { query: "acuda" }, true)).toBe(false);
    expect(shouldDeferWrite("resolve_entity", { text: "Macronet" }, true)).toBe(false);
    expect(shouldDeferWrite("mailbox_coverage", {}, true)).toBe(false);
    expect(
      decideWriteDeferral({
        toolName: "search_emails",
        args: { query: "acuda" },
        allowWrites: true,
        pendingCount: 0,
      }).kind,
    ).toBe("execute");
  });

  it("las escrituras reales siguen difiriéndose", () => {
    const expectedWrites = [
      "create_account",
      "update_deal",
      "bulk_update_installations",
      "create_ticket",
      "attach_file_to_entity",
      "add_deal_note",
      "create_crm_from_email",
    ];
    // Lecturas nuevas del buscador de correos NUNCA deben diferirse.
    expect(WRITE_TOOL_NAMES.has("resolve_entity")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("mailbox_coverage")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("search_emails")).toBe(false);
    for (const t of expectedWrites) {
      expect(WRITE_TOOL_NAMES.has(t)).toBe(true);
      expect(shouldDeferWrite(t, { id: "x", confirm: true }, true)).toBe(true);
    }
  });

  it("create_crm_from_email sin confirm ejecuta (propuesta)", () => {
    expect(shouldDeferWrite("create_crm_from_email", { threadId: "t1" }, true)).toBe(false);
  });

  it("create_crm_from_email con confirm:true se difiere", () => {
    expect(shouldDeferWrite("create_crm_from_email", { confirm: true, proposal: {} }, true)).toBe(true);
  });

  it("preview ok encola escritura mapeada", () => {
    const d = decideWriteDeferral({
      toolName: "preview_bulk_update_installations",
      args: { query: "Melón", status: "inactive" },
      allowWrites: true,
      pendingCount: 0,
      executedResult: { ok: true },
    });
    expect(d.kind).toBe("defer");
    if (d.kind === "defer") {
      expect(d.pending.confirmToolName).toBe("bulk_update_installations");
      expect(d.pending.previewToolName).toBe("preview_bulk_update_installations");
    }
  });

  it("tope de 8 pendings", () => {
    const d = decideWriteDeferral({
      toolName: "create_ticket",
      args: { title: "x" },
      allowWrites: true,
      pendingCount: 8,
    });
    expect(d.kind).toBe("limit");
  });

  it("deferWrites:false (chat web) siempre ejecuta, incluso create_deal", () => {
    const d = decideWriteDeferral({
      toolName: "create_deal",
      args: { accountId: "a", title: "Acuda", stageName: "Negociación" },
      allowWrites: true,
      pendingCount: 0,
      deferWrites: false,
    });
    expect(d.kind).toBe("execute");
  });

  it("deferWrites:false no encola confirm tras preview_*", () => {
    const d = decideWriteDeferral({
      toolName: "preview_bulk_update_installations",
      args: { query: "Melón", status: "inactive" },
      allowWrites: true,
      pendingCount: 0,
      executedResult: { ok: true },
      deferWrites: false,
    });
    expect(d.kind).toBe("execute");
  });
});
