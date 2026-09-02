import { describe, expect, it } from "vitest";
import {
  buildToolRejectionMessage,
  toMcpTools,
  MCP_DESTRUCTIVE_TOOL_NAMES,
} from "../protocol";

describe("toMcpTools", () => {
  const defs = [
    {
      type: "function" as const,
      function: {
        name: "get_tenant_summary",
        description: "Resumen del tenant",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "remove_quote_position",
        description: "Elimina puesto",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "delete_deal",
        description: "Elimina negocio",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  it("marca readOnlyHint en tools de lectura", () => {
    const tools = toMcpTools(defs, { writeToolNames: new Set(["remove_quote_position"]) });
    const read = tools.find((t) => t.name === "get_tenant_summary");
    expect(read?.annotations.readOnlyHint).toBe(true);
    expect(read?.annotations.destructiveHint).toBe(false);
    expect(read?.annotations.openWorldHint).toBe(false);
  });

  it("marca destructiveHint en tools destructivas de escritura", () => {
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("remove_quote_position")).toBe(true);
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("delete_deal")).toBe(true);
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("delete_quote")).toBe(true);
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("delete_lead")).toBe(true);
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("delete_camera")).toBe(true);
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("delete_camera_layout")).toBe(true);
    const tools = toMcpTools(defs, {
      writeToolNames: new Set(["remove_quote_position", "delete_deal"]),
    });
    const write = tools.find((t) => t.name === "remove_quote_position");
    expect(write?.annotations.readOnlyHint).toBe(false);
    expect(write?.annotations.destructiveHint).toBe(true);
    const del = tools.find((t) => t.name === "delete_deal");
    expect(del?.annotations.readOnlyHint).toBe(false);
    expect(del?.annotations.destructiveHint).toBe(true);
  });
});

describe("buildToolRejectionMessage", () => {
  it("explica scope READ vs tool de escritura", () => {
    const msg = buildToolRejectionMessage("create_lead", {
      keyScope: "READ",
      allowWrites: false,
      isWriteTool: true,
      isListed: false,
    });
    expect(msg).toContain("READ");
    expect(msg).toContain("create_lead");
  });

  it("explica allowWrites deshabilitado en tenant", () => {
    const msg = buildToolRejectionMessage("create_lead", {
      keyScope: "READ_WRITE",
      allowWrites: false,
      isWriteTool: true,
      isListed: false,
    });
    expect(msg).toContain("allowWrites");
    expect(msg).toContain("Asistente IA");
  });
});
