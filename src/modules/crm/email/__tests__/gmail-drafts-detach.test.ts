/**
 * Reparación de contaminación cruzada de borradores: saca de los hilos de una
 * casilla los espejos de borradores cuyo dueño es OTRA casilla (bug histórico
 * de matching por asunto). Nunca toca borradores propios ni legacy sin dueño.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  msgFindMany: vi.fn(),
  msgDeleteMany: vi.fn(),
  msgCount: vi.fn(),
  threadDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailMessage: {
      findMany: mocks.msgFindMany,
      deleteMany: mocks.msgDeleteMany,
      count: mocks.msgCount,
    },
    crmEmailThread: { deleteMany: mocks.threadDeleteMany },
  },
}));

import { detachForeignDraftMirrors } from "../gmail-drafts.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.msgFindMany.mockResolvedValue([]);
  mocks.msgDeleteMany.mockResolvedValue({ count: 0 });
  mocks.msgCount.mockResolvedValue(1);
  mocks.threadDeleteMany.mockResolvedValue({ count: 0 });
});

describe("detachForeignDraftMirrors", () => {
  it("filtra por borrador ajeno colgado de un hilo propio", async () => {
    await detachForeignDraftMirrors({ tenantId: "t1", emailAccountId: "me" });
    const where = mocks.msgFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: "t1",
      isDraft: true,
      emailAccountId: { not: "me" },
      thread: { emailAccountId: "me" },
    });
  });

  it("borra los espejos ajenos y limpia el hilo si quedó vacío", async () => {
    mocks.msgFindMany.mockResolvedValue([
      { id: "m1", threadId: "th-empty" },
      { id: "m2", threadId: "th-keep" },
    ]);
    // th-empty queda sin mensajes; th-keep conserva el borrador propio.
    mocks.msgCount.mockImplementation(async ({ where }: { where: { threadId: string } }) =>
      where.threadId === "th-empty" ? 0 : 1,
    );

    const removed = await detachForeignDraftMirrors({ tenantId: "t1", emailAccountId: "me" });

    expect(removed).toBe(2);
    expect(mocks.msgDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["m1", "m2"] } } });
    // Solo el hilo vacío se elimina; el que aún tiene el borrador propio, no.
    expect(mocks.threadDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.threadDeleteMany).toHaveBeenCalledWith({
      where: { id: "th-empty", tenantId: "t1" },
    });
  });

  it("no hace nada cuando no hay borradores ajenos", async () => {
    const removed = await detachForeignDraftMirrors({ tenantId: "t1", emailAccountId: "me" });
    expect(removed).toBe(0);
    expect(mocks.msgDeleteMany).not.toHaveBeenCalled();
    expect(mocks.threadDeleteMany).not.toHaveBeenCalled();
  });
});
