import { describe, expect, it } from "vitest";
import {
  resolveEmailThreadId,
  stripHtmlForAi,
} from "@/lib/ai/help-chat-email-context";

describe("resolveEmailThreadId", () => {
  it("prioriza threadId del args", () => {
    expect(
      resolveEmailThreadId(
        { threadId: " abc " },
        {
          entityType: "crm_email_thread",
          entityId: "from-context",
          entityName: "Mail",
        },
      ),
    ).toBe("abc");
  });

  it("usa page context crm_email_thread si no hay args", () => {
    expect(
      resolveEmailThreadId(
        {},
        {
          entityType: "crm_email_thread",
          entityId: "thread-1",
          entityName: "Servicio de vigilancia",
        },
      ),
    ).toBe("thread-1");
  });

  it("ignora page context de otro tipo", () => {
    expect(
      resolveEmailThreadId(
        {},
        {
          entityType: "crm_account",
          entityId: "acc-1",
          entityName: "Minsal",
        },
      ),
    ).toBe("");
  });

  it("devuelve vacío sin args ni contexto", () => {
    expect(resolveEmailThreadId({}, null)).toBe("");
  });
});

describe("stripHtmlForAi", () => {
  it("elimina tags y colapsa espacios", () => {
    expect(stripHtmlForAi("<p>Hola&nbsp;<b>mundo</b></p>")).toBe("Hola mundo");
  });
});
