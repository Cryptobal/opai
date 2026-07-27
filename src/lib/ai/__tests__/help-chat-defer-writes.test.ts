import { describe, expect, it } from "vitest";
import { decideWriteDeferral, shouldDeferWrite } from "@/lib/ai/help-chat-defer-writes";

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
});
