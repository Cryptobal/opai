import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    slackChannelRoute: { findMany, count: vi.fn() },
  },
}));

vi.mock("@/lib/rondas/notification-policy", () => ({
  getRondasNotifPolicy: vi.fn(),
}));

vi.mock("@/lib/integrations/slack/workspace", () => ({
  getWorkspaceForTenant: vi.fn(),
}));

vi.mock("@/lib/integrations/slack/deal-rooms/room", () => ({
  getOpenDealRoom: vi.fn(),
  refreshDealRoomFicha: vi.fn(),
}));

import {
  isSlackTypeMuted,
  resolveChannel,
  resolveChannelResolution,
} from "@/lib/integrations/slack/dispatch";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";

const typeDef = {
  key: "new_postulacion",
  category: "Operaciones - Guardias",
  module: "ops",
} as UnifiedNotificationType;

describe("resolveChannelResolution", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("falls back to default when there is no route", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      resolveChannelResolution("t1", typeDef, "C-DEFAULT"),
    ).resolves.toEqual({ status: "channel", channelId: "C-DEFAULT" });
    await expect(resolveChannel("t1", typeDef, "C-DEFAULT")).resolves.toBe("C-DEFAULT");
    await expect(isSlackTypeMuted("t1", typeDef)).resolves.toBe(false);
  });

  it("uses enabled KEY over default", async () => {
    findMany.mockResolvedValue([
      { matchType: "KEY", channelId: "C-RRHH", enabled: true },
      { matchType: "MODULE", channelId: "C-OPS", enabled: true },
    ]);
    await expect(
      resolveChannelResolution("t1", typeDef, "C-DEFAULT"),
    ).resolves.toEqual({ status: "channel", channelId: "C-RRHH" });
  });

  it("mutes when the winning KEY route is disabled (no fallthrough to default)", async () => {
    findMany.mockResolvedValue([
      { matchType: "KEY", channelId: "C-RRHH", enabled: false },
      { matchType: "MODULE", channelId: "C-OPS", enabled: true },
    ]);
    await expect(
      resolveChannelResolution("t1", typeDef, "C-DEFAULT"),
    ).resolves.toEqual({ status: "muted" });
    await expect(resolveChannel("t1", typeDef, "C-DEFAULT")).resolves.toBeNull();
    await expect(isSlackTypeMuted("t1", typeDef)).resolves.toBe(true);
  });

  it("mutes when CATEGORY is disabled and there is no KEY", async () => {
    findMany.mockResolvedValue([
      { matchType: "CATEGORY", channelId: "C-CAT", enabled: false },
      { matchType: "MODULE", channelId: "C-OPS", enabled: true },
    ]);
    await expect(
      resolveChannelResolution("t1", typeDef, "C-DEFAULT"),
    ).resolves.toEqual({ status: "muted" });
  });

  it("returns none when muted check has no default and no routes", async () => {
    findMany.mockResolvedValue([]);
    await expect(resolveChannelResolution("t1", typeDef, null)).resolves.toEqual({
      status: "none",
    });
  });
});
