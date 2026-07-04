/**
 * Evals de regresión del agente help-chat (decisiones de tools y diferido).
 * Determinístico: sin red ni DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolCallInfo } from "@/lib/ai/help-chat-provider";

type StreamStep = { tokens?: string; toolCalls?: ToolCallInfo[] };

const hoisted = vi.hoisted(() => {
  const streamSteps: StreamStep[] = [];
  const executeCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    streamSteps,
    executeCalls,
    enqueue(step: StreamStep) {
      streamSteps.push(step);
    },
    nextStep(): StreamStep {
      return streamSteps.shift() ?? { tokens: "ok" };
    },
    reset() {
      streamSteps.length = 0;
      executeCalls.length = 0;
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: {
      findUnique: vi.fn(async () => ({
        name: "Carlos",
        email: "carlos@gard.cl",
        role: "owner",
      })),
    },
  },
}));

vi.mock("@/lib/ai/help-chat-config", () => ({
  getAiHelpChatConfig: vi.fn(async () => ({
    enabled: true,
    allowedRoles: ["owner"],
    allowDataQuestions: true,
    allowWrites: true,
  })),
}));

vi.mock("@/lib/ai/help-chat-retrieval", () => ({
  retrieveDocsContext: vi.fn(async () => []),
  retrieveTemplatesContext: vi.fn(async () => []),
}));

vi.mock("@/lib/knowledge/search", () => ({
  searchKnowledge: vi.fn(async () => []),
}));

vi.mock("@/lib/platform-ai-service", () => ({
  logAiUsage: vi.fn(),
}));

vi.mock("@/lib/ai/help-chat-provider", () => ({
  getHelpChatAIConfig: vi.fn(async () => ({
    providerType: "openai" as const,
    apiKey: "test-key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    displayName: "Test",
    source: "platform" as const,
  })),
  createStreamingCompletion: vi.fn(async function* () {
    const step = hoisted.nextStep();
    if (step.tokens) yield { type: "token" as const, text: step.tokens };
    if (step.toolCalls?.length) yield { type: "tool_calls" as const, calls: step.toolCalls };
  }),
}));

vi.mock("@/lib/ai/help-chat-tools-v2", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/help-chat-tools-v2")>();
  return {
    ...actual,
    executeToolCallV2: vi.fn(async (toolName: string, args: Record<string, unknown>) => {
      hoisted.executeCalls.push({ name: toolName, args });
      if (toolName === "search_installations") {
        return {
          ok: true,
          data: [
            { id: "11111111-1111-4111-8111-111111111111", name: "Ametel Centro", url: "/crm/installations/a" },
            { id: "22222222-2222-4222-8222-222222222222", name: "Ametel Norte", url: "/crm/installations/b" },
          ],
        };
      }
      if (toolName === "preview_bulk_update_installations") {
        return { ok: true, data: { count: 2, installations: [{ name: "Melón Plaza" }] } };
      }
      if (toolName === "get_tickets_summary") {
        return { ok: true, data: { slaOverdueOpen: 7, totalOpen: 12 } };
      }
      if (toolName === "search_contacts") {
        return { ok: true, data: [{ id: "c1", name: "Felipe Rivas" }] };
      }
      return { ok: true, data: {} };
    }),
  };
});

import { runHelpChatTurn } from "@/lib/ai/help-chat-runner";
import { getDefaultPermissions } from "@/lib/permissions";
import { WRITE_TOOL_NAMES } from "@/lib/ai/help-chat-tools-v2";

const INST_A = "11111111-1111-4111-8111-111111111111";
const INST_B = "22222222-2222-4222-8222-222222222222";

function tc(id: string, name: string, args: Record<string, unknown>): ToolCallInfo {
  return { id, name, arguments: JSON.stringify(args) };
}

function baseInput(message: string) {
  return {
    tenantId: "tenant-test",
    userId: "admin-test",
    perms: getDefaultPermissions("owner"),
    canViewAllRendiciones: true,
    history: [] as Array<{ role: string; content: string }>,
    userMessage: message,
    allowWrites: true,
  };
}

function script(...steps: StreamStep[]) {
  for (const s of steps) hoisted.enqueue(s);
}

describe("agent evals — runHelpChatTurn", () => {
  beforeEach(() => {
    hoisted.reset();
  });

  it("ametel: search ejecutada, 2 updates diferidos con nombre en summary", async () => {
    script(
      { toolCalls: [tc("c1", "search_installations", { query: "Ametel" })] },
      {
        toolCalls: [
          tc("c2", "update_installation", { id: INST_A, name: "Ametel Centro", status: "inactive" }),
          tc("c3", "update_installation", { id: INST_B, name: "Ametel Norte", status: "inactive" }),
        ],
      },
      { tokens: "Preparé la inactivación de las instalaciones de Ametel." },
    );

    const result = await runHelpChatTurn(baseInput("inactiva las instalaciones del cliente ametel"));

    const executed = hoisted.executeCalls.map((c) => c.name);
    expect(executed).toEqual(["search_installations"]);
    expect(result.pendingConfirmations?.length).toBe(2);
    expect(result.pendingConfirmations?.[0].confirmToolName).toBe("update_installation");
    expect(result.pendingConfirmations?.every((p) => /ametel/i.test(p.summary))).toBe(true);
  });

  it("melón bulk: preview ejecutado + pending bulk_update_installations", async () => {
    script(
      { toolCalls: [tc("c1", "preview_bulk_update_installations", { query: "Melón", status: "inactive" })] },
      { tokens: "Encontré instalaciones de Melón para inactivar." },
    );

    const result = await runHelpChatTurn(baseInput("todas las de melon a inactive"));

    expect(hoisted.executeCalls.map((c) => c.name)).toEqual(["preview_bulk_update_installations"]);
    expect(result.pendingConfirmations?.length).toBe(1);
    expect(result.pendingConfirmations?.[0].confirmToolName).toBe("bulk_update_installations");
    expect(result.pendingConfirmations?.[0].previewToolName).toBe("preview_bulk_update_installations");
  });

  it("create_ticket P1: diferido, no ejecutado", async () => {
    script(
      { toolCalls: [tc("c1", "create_ticket", { title: "Falla acceso", priority: "p1" })] },
      { tokens: "Ticket preparado para confirmación." },
    );

    const result = await runHelpChatTurn(baseInput("crea un ticket P1 por falla de acceso en bodega"));

    expect(hoisted.executeCalls.some((c) => c.name === "create_ticket")).toBe(false);
    expect(result.pendingConfirmations?.length).toBe(1);
    expect(result.pendingConfirmations?.[0].confirmToolName).toBe("create_ticket");
  });

  it("TK-1234: take_ticket y comment_ticket en orden, ambos diferidos", async () => {
    script(
      {
        toolCalls: [
          tc("c1", "take_ticket", { code: "TK-1234" }),
          tc("c2", "comment_ticket", { code: "TK-1234", body: "Revisando en terreno" }),
        ],
      },
      { tokens: "Quedaron pendientes tomar y comentar el ticket." },
    );

    const result = await runHelpChatTurn(baseInput("toma el TK-1234 y comenta revisando en terreno"));

    expect(hoisted.executeCalls.some((c) => WRITE_TOOL_NAMES.has(c.name))).toBe(false);
    expect(result.pendingConfirmations?.map((p) => p.confirmToolName)).toEqual([
      "take_ticket",
      "comment_ticket",
    ]);
  });

  it("6ª escritura en un turno: 5 pendings y sin ejecutar writes", async () => {
    const writes = Array.from({ length: 6 }, (_, i) =>
      tc(`w${i}`, "update_installation", { id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`, status: "inactive" }),
    );
    script({ toolCalls: writes }, { tokens: "Máximo de acciones alcanzado." });

    const result = await runHelpChatTurn(baseInput("inactiva estas 6 instalaciones ya"));

    expect(result.pendingConfirmations?.length).toBe(5);
    expect(hoisted.executeCalls.filter((c) => WRITE_TOOL_NAMES.has(c.name)).length).toBe(0);
    expect(result.toolCallsUsed).toBe(6);
  });

  it("lectura pura tickets vencidos: tool ejecutada, cero pendings", async () => {
    script(
      { toolCalls: [tc("c1", "get_tickets_summary", { solo_vencidos_sla: true })] },
      { tokens: "Hay 7 tickets con SLA vencido." },
    );

    const result = await runHelpChatTurn(baseInput("cuantos tickets vencidos hay"));

    expect(hoisted.executeCalls.map((c) => c.name)).toEqual(["get_tickets_summary"]);
    expect(result.pendingConfirmations ?? []).toHaveLength(0);
  });

  it("update_account: diferido sin ejecutar", async () => {
    script(
      { toolCalls: [tc("c1", "update_account", { id: "aaaa1111-1111-4111-8111-111111111111", status: "inactive" })] },
      { tokens: "Listo." },
    );
    const result = await runHelpChatTurn(baseInput("desactiva la cuenta ametel"));
    expect(hoisted.executeCalls.some((c) => c.name === "update_account")).toBe(false);
    expect(result.pendingConfirmations?.[0].confirmToolName).toBe("update_account");
  });

  it("create_lead: diferido", async () => {
    script(
      { toolCalls: [tc("c1", "create_lead", { firstName: "Juan", lastName: "Pérez", email: "j@t.cl" })] },
      { tokens: "Lead listo." },
    );
    const result = await runHelpChatTurn(baseInput("crea un lead juan perez j@t.cl"));
    expect(result.pendingConfirmations?.[0].confirmToolName).toBe("create_lead");
    expect(hoisted.executeCalls.some((c) => c.name === "create_lead")).toBe(false);
  });

  it("transition_ticket: diferido", async () => {
    script(
      { toolCalls: [tc("c1", "transition_ticket", { code: "TK-99", status: "resolved" })] },
      { tokens: "Transición pendiente." },
    );
    const result = await runHelpChatTurn(baseInput("cierra el TK-99 como resuelto"));
    expect(result.pendingConfirmations?.[0].confirmToolName).toBe("transition_ticket");
  });

  it("search_contacts lectura: ejecutada sin pendings", async () => {
    script(
      { toolCalls: [tc("c1", "search_contacts", { query: "Felipe" })] },
      { tokens: "Encontré contactos." },
    );
    const result = await runHelpChatTurn(baseInput("busca contactos felipe"));
    expect(hoisted.executeCalls.map((c) => c.name)).toEqual(["search_contacts"]);
    expect(result.pendingConfirmations ?? []).toHaveLength(0);
  });

  it("reassign_ticket: diferido como escritura ops", async () => {
    script(
      { toolCalls: [tc("c1", "reassign_ticket", { code: "TK-55", assignedTo: "bbbb2222-2222-4222-8222-222222222222" })] },
      { tokens: "Reasignación pendiente." },
    );
    const result = await runHelpChatTurn(baseInput("reasigna TK-55 a maria"));
    expect(result.pendingConfirmations?.[0].confirmToolName).toBe("reassign_ticket");
    expect(hoisted.executeCalls.some((c) => c.name === "reassign_ticket")).toBe(false);
  });
});
