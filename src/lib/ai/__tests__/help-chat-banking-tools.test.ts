import { describe, it, expect } from "vitest";
import {
  bankingReadToolDefinitions,
  bankingWriteToolDefinitions,
  resolveFlowRowByNameOrId,
  statusToTab,
} from "@/lib/ai/help-chat-banking-tools";
import {
  getToolDefinitionsV2,
  PREVIEW_TO_CONFIRM,
  WRITE_TOOL_NAMES,
} from "@/lib/ai/help-chat-tools-v2";

describe("banking MCP tool definitions", () => {
  it("expone tools de lectura bancaria", () => {
    const names = bankingReadToolDefinitions().map((d) => d.function.name);
    expect(names).toContain("list_bank_accounts");
    expect(names).toContain("list_bank_movements");
    expect(names).toContain("get_bank_movement_detail");
    expect(names).toContain("get_bank_movement_triage");
    expect(names).toContain("get_bank_classify_suggestions");
    expect(names).toContain("get_bank_reconcile_candidates");
    expect(names).toContain("list_bank_statement_imports");
    expect(names).toContain("search_flow_rows");
    expect(names).toContain("flow_cashflow_insights");
  });

  it("expone preview/confirm para clasificar y autorizar", () => {
    const writeNames = bankingWriteToolDefinitions().map((d) => d.function.name);
    expect(writeNames).toContain("preview_classify_bank_movement");
    expect(writeNames).toContain("classify_bank_movement");
    expect(writeNames).toContain("preview_authorize_bank_suggestions");
    expect(writeNames).toContain("authorize_bank_suggestions");
  });

  it("integra banking en getToolDefinitionsV2 y PREVIEW_TO_CONFIRM", () => {
    const readOnly = getToolDefinitionsV2(true, false);
    const all = getToolDefinitionsV2(true, true).map((d) => d.function.name);
    expect(readOnly.length).toBeGreaterThanOrEqual(62);
    expect(all.length).toBeGreaterThanOrEqual(119);
    expect(all).toContain("list_bank_movements");
    expect(all).toContain("classify_bank_movement");
    expect(PREVIEW_TO_CONFIRM.preview_classify_bank_movement?.confirmToolName).toBe(
      "classify_bank_movement",
    );
    expect(PREVIEW_TO_CONFIRM.preview_authorize_bank_suggestions?.confirmToolName).toBe(
      "authorize_bank_suggestions",
    );
    expect(WRITE_TOOL_NAMES.has("classify_bank_movement")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("preview_classify_bank_movement")).toBe(false);
  });
});

describe("statusToTab", () => {
  it("mapea estados de bandeja MCP a tabs del API", () => {
    expect(statusToTab("unmatched")).toBe("unrecognized");
    expect(statusToTab("pending_authorize")).toBe("recognized");
    expect(statusToTab("reconciled")).toBe("matched");
    expect(statusToTab("all")).toBe("all");
  });
});

describe("resolveFlowRowByNameOrId", () => {
  it("rechaza búsqueda vacía", async () => {
    const r = await resolveFlowRowByNameOrId("00000000-0000-0000-0000-000000000001");
    expect("error" in r).toBe(true);
  });
});
