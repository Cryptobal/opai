import { describe, expect, it } from "vitest";
import { pageContextFromCorreoUrl } from "@/lib/ai/help-chat-correo-url-context";

describe("pageContextFromCorreoUrl", () => {
  const threadId = "674bdaeb-7320-4581-bdf6-d752dee02195";

  it("sintetiza contexto desde ?thread=", () => {
    const ctx = pageContextFromCorreoUrl(
      "/crm/correos",
      `?thread=${threadId}`,
    );
    expect(ctx).toEqual({
      entityType: "crm_email_thread",
      entityId: threadId,
      entityName: "Correo abierto",
      entityUrl: `/crm/correos?thread=${threadId}`,
    });
  });

  it("prioriza ?hilo= sobre ?thread=", () => {
    const other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const ctx = pageContextFromCorreoUrl(
      "/crm/correos",
      `?thread=${other}&hilo=${threadId}`,
    );
    expect(ctx?.entityId).toBe(threadId);
  });

  it("ignora rutas que no son Correos", () => {
    expect(
      pageContextFromCorreoUrl("/crm/accounts", `?thread=${threadId}`),
    ).toBeNull();
  });

  it("ignora threadId que no es UUID", () => {
    expect(
      pageContextFromCorreoUrl("/crm/correos", "?thread=not-a-uuid"),
    ).toBeNull();
  });

  it("devuelve null sin query", () => {
    expect(pageContextFromCorreoUrl("/crm/correos", "")).toBeNull();
    expect(pageContextFromCorreoUrl("/crm/correos", null)).toBeNull();
  });
});
