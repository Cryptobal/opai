import { describe, expect, it } from "vitest";
import type { ChatChannelData, ChatMessageData } from "@/lib/chat-types";
import {
  applyChannelSummaryPatch,
  applyDeletedMessages,
  applyReactionEvent,
  reconcileRealtimeMessages,
  type ReactionEvent,
} from "../lib/chat-state";

function message(id: string, content = id): ChatMessageData {
  return {
    id,
    channelId: "channel-1",
    senderType: "ADMIN",
    senderId: "admin-1",
    senderName: "Admin",
    senderAvatar: null,
    content,
    contentHtml: null,
    replyTo: null,
    threadRootId: null,
    replyCount: 0,
    lastReplyAt: null,
    attachments: null,
    reactions: [],
    systemEventType: null,
    systemEventData: null,
    isEdited: false,
    createdAt: "2026-04-25T20:00:00.000Z",
  };
}

function channel(id: string, overrides: Partial<ChatChannelData> = {}): ChatChannelData {
  return {
    id,
    tenantId: "tenant-1",
    channelType: "GROUP",
    installationId: null,
    subType: null,
    groupId: null,
    name: id,
    isActive: true,
    lastMessageAt: "2026-04-25T20:00:00.000Z",
    lastMessagePreview: "preview viejo",
    messageCount: 3,
    createdAt: "2026-04-25T19:00:00.000Z",
    updatedAt: "2026-04-25T20:00:00.000Z",
    ...overrides,
  };
}

describe("chat state reconciliation", () => {
  it("no reinyecta mensajes realtime que ya fueron borrados", () => {
    const deleted = new Set(["m-1"]);

    const result = reconcileRealtimeMessages(
      [message("m-2")],
      [message("m-1", "fantasma"), message("m-3")],
      deleted,
    );

    expect(result.map((item) => item.id)).toEqual(["m-2", "m-3"]);
  });

  it("remueve mensajes borrados desde un set de eventos", () => {
    const result = applyDeletedMessages(
      [message("m-1"), message("m-2"), message("m-3")],
      new Set(["m-2"]),
    );

    expect(result.map((item) => item.id)).toEqual(["m-1", "m-3"]);
  });

  it("actualiza el resumen del canal sin tocar otros canales", () => {
    const result = applyChannelSummaryPatch(
      [channel("channel-1"), channel("channel-2")],
      {
        channelId: "channel-1",
        lastMessagePreview: null,
        lastMessageAt: null,
        messageCount: 0,
      },
    );

    expect(result[0]).toMatchObject({
      id: "channel-1",
      lastMessagePreview: null,
      lastMessageAt: null,
      messageCount: 0,
    });
    expect(result[1]).toMatchObject({
      id: "channel-2",
      lastMessagePreview: "preview viejo",
      messageCount: 3,
    });
  });
});

describe("applyReactionEvent", () => {
  const add = (senderId: string): ReactionEvent => ({
    action: "add",
    messageId: "m-1",
    emoji: "👍",
    sender: { id: senderId, name: senderId, type: "ADMIN" },
  });
  const remove = (senderId: string): ReactionEvent => ({
    action: "remove",
    messageId: "m-1",
    emoji: "👍",
    sender: { id: senderId, name: senderId, type: "ADMIN" },
  });

  it("agrega una reacción nueva al mensaje correcto", () => {
    const result = applyReactionEvent([message("m-1"), message("m-2")], add("slack-user"));
    expect(result[0].reactions).toEqual([
      { emoji: "👍", count: 1, senders: [{ id: "slack-user", name: "slack-user", type: "ADMIN" }] },
    ]);
    expect(result[1].reactions).toEqual([]);
  });

  it("es idempotente: no duplica cuando el mismo sender ya reaccionó (optimista propio)", () => {
    const once = applyReactionEvent([message("m-1")], add("admin-1"));
    const twice = applyReactionEvent(once, add("admin-1"));
    expect(twice[0].reactions).toEqual([
      { emoji: "👍", count: 1, senders: [{ id: "admin-1", name: "admin-1", type: "ADMIN" }] },
    ]);
  });

  it("incrementa el conteo con senders distintos", () => {
    const result = [add("a"), add("b")].reduce(applyReactionEvent, [message("m-1")]);
    expect(result[0].reactions[0].count).toBe(2);
  });

  it("remueve la reacción del sender y elimina el grupo si queda vacío", () => {
    const withReaction = applyReactionEvent([message("m-1")], add("a"));
    const result = applyReactionEvent(withReaction, remove("a"));
    expect(result[0].reactions).toEqual([]);
  });

  it("remove es no-op si el sender no reaccionó", () => {
    const withReaction = applyReactionEvent([message("m-1")], add("a"));
    const result = applyReactionEvent(withReaction, remove("desconocido"));
    expect(result[0].reactions[0].senders.map((s) => s.id)).toEqual(["a"]);
  });
});
