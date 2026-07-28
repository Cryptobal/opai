import { describe, expect, it } from "vitest";
import {
  HUB_RECENT_EMAILS_LIMIT,
  mergeHubEmailThreads,
  mergeHubSnoozedThreads,
} from "../hub-recent-emails";

type Row = Parameters<typeof mergeHubEmailThreads>[0][number];

function row(overrides: Partial<Row> & { id: string }): Row {
  return {
    subject: `Asunto ${overrides.id}`,
    lastMessageAt: new Date("2026-07-20T10:00:00Z"),
    isUnread: false,
    attachmentCount: 0,
    providerThreadId: null,
    messages: [{ fromEmail: "a@b.cl", textBody: "hola", htmlBody: null }],
    accountEmail: "yo@empresa.cl",
    ...overrides,
  };
}

describe("mergeHubEmailThreads", () => {
  it("ordena no leídos recientes primero y luego leídos recientes", () => {
    const items = mergeHubEmailThreads([
      row({ id: "leido-nuevo", lastMessageAt: new Date("2026-07-22T10:00:00Z") }),
      row({ id: "unread-viejo", isUnread: true, lastMessageAt: new Date("2026-07-18T10:00:00Z") }),
      row({ id: "unread-nuevo", isUnread: true, lastMessageAt: new Date("2026-07-21T10:00:00Z") }),
      row({ id: "leido-viejo", lastMessageAt: new Date("2026-07-10T10:00:00Z") }),
    ]);
    expect(items.map((i) => i.id)).toEqual([
      "unread-nuevo",
      "unread-viejo",
      "leido-nuevo",
      "leido-viejo",
    ]);
  });

  it("no re-rankea por clasificaciones: un correo antiguo leído nunca queda arriba", () => {
    const items = mergeHubEmailThreads([
      row({ id: "antiguo", lastMessageAt: new Date("2026-06-01T10:00:00Z") }),
      row({ id: "reciente", lastMessageAt: new Date("2026-07-22T10:00:00Z") }),
    ]);
    expect(items[0].id).toBe("reciente");
  });

  it("limita a máximo 5 resultados", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ id: `t${i}`, lastMessageAt: new Date(2026, 6, i + 1) }),
    );
    expect(mergeHubEmailThreads(rows).length).toBe(HUB_RECENT_EMAILS_LIMIT);
  });

  it("con dos casillas deduplica por providerThreadId y conserva identidad de origen", () => {
    const items = mergeHubEmailThreads([
      row({
        id: "a1",
        providerThreadId: "gmail-x",
        accountEmail: "ventas@empresa.cl",
        isUnread: true,
      }),
      row({
        id: "b1",
        providerThreadId: "gmail-x",
        accountEmail: "soporte@empresa.cl",
      }),
      row({ id: "b2", accountEmail: "soporte@empresa.cl" }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["a1", "b2"]);
    expect(items[0].accountEmail).toBe("ventas@empresa.cl");
    expect(items[1].accountEmail).toBe("soporte@empresa.cl");
  });

  it("acota el snippet a ~80 caracteres y marca adjuntos solo desde metadatos locales", () => {
    const long = "x".repeat(300);
    const items = mergeHubEmailThreads([
      row({
        id: "s1",
        attachmentCount: 2,
        messages: [{ fromEmail: "a@b.cl", textBody: long, htmlBody: null }],
      }),
    ]);
    expect(items[0].snippet!.length).toBeLessThanOrEqual(81); // 80 + elipsis
    expect(items[0].hasAttachment).toBe(true);
  });
});

describe("mergeHubSnoozedThreads", () => {
  it("ordena por despertar más próximo y conserva snoozedUntil", () => {
    const items = mergeHubSnoozedThreads([
      row({
        id: "late",
        snoozedUntil: new Date("2026-07-30T10:00:00Z"),
      }),
      row({
        id: "soon",
        snoozedUntil: new Date("2026-07-28T09:00:00Z"),
      }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["soon", "late"]);
    expect(items[0].snoozedUntil).toBe("2026-07-28T09:00:00.000Z");
  });
});
