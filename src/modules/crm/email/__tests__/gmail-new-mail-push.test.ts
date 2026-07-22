/**
 * Tests del gatillo de push por correo nuevo (PR-15, C22a).
 *
 * Cubre:
 *  - 1 inbound nuevo → notificación con remitente como título, asunto
 *    truncado y deep link al hilo.
 *  - Varios inbound → UNA notificación agrupada "N correos nuevos" → bandeja.
 *  - 0 nuevos → no notifica.
 *  - El filtro excluye direction out, remitente propio y mensajes sin INBOX.
 *  - Si notify falla, el gatillo no lanza (el sync no falla).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindMany: vi.fn(),
  notify: vi.fn(),
  captureEmailError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { crmEmailMessage: { findMany: mocks.messageFindMany } },
}));
vi.mock("@/lib/notifications/notify", () => ({ notify: mocks.notify }));
vi.mock("../email-observability", () => ({
  captureEmailError: mocks.captureEmailError,
}));

import { notifyNewInboundMail } from "../gmail-new-mail-push";

const PARAMS = {
  tenantId: "t1",
  emailAccountId: "acc-1",
  ownerUserId: "user-1",
  ownEmail: "Yo@Empresa.cl",
  since: new Date("2026-07-22T12:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notify.mockResolvedValue({ delivered: 1 });
});

describe("notifyNewInboundMail", () => {
  it("1 correo: título = remitente, cuerpo = asunto truncado, deep link al hilo", async () => {
    mocks.messageFindMany.mockResolvedValue([
      {
        threadId: "thr-9",
        fromEmail: "cliente@acme.cl",
        subject: "x".repeat(120),
      },
    ]);

    const out = await notifyNewInboundMail(PARAMS);

    expect(out.notified).toBe(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const call = mocks.notify.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: "t1",
      type: "correo_nuevo",
      targetIds: ["user-1"],
      targetType: "ADMIN",
      title: "cliente@acme.cl",
      link: "/crm/correos?thread=thr-9",
    });
    // Asunto truncado a ~80 chars, sin cuerpo del mensaje en el payload.
    expect(call.body.length).toBeLessThanOrEqual(81);
    expect(call.body.endsWith("…")).toBe(true);
  });

  it("varios correos: una sola notificación agrupada hacia la bandeja", async () => {
    mocks.messageFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        threadId: `thr-${i}`,
        fromEmail: `p${i}@x.cl`,
        subject: `asunto ${i}`,
      })),
    );

    const out = await notifyNewInboundMail(PARAMS);

    expect(out.notified).toBe(5);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0][0]).toMatchObject({
      title: "5 correos nuevos",
      link: "/crm/correos?folder=inbox",
    });
  });

  it("sin inbound nuevos no notifica", async () => {
    mocks.messageFindMany.mockResolvedValue([]);
    const out = await notifyNewInboundMail(PARAMS);
    expect(out.notified).toBe(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("filtra por inbound de la corrida: direction in, INBOX, no remitente propio", async () => {
    mocks.messageFindMany.mockResolvedValue([]);
    await notifyNewInboundMail(PARAMS);

    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          emailAccountId: "acc-1",
          direction: "in",
          createdAt: { gte: PARAMS.since },
          labelIds: { has: "INBOX" },
          NOT: { fromEmail: "yo@empresa.cl" },
        }),
      }),
    );
  });

  it("si el push falla, no lanza (el sync no falla)", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { threadId: "thr-1", fromEmail: "a@b.cl", subject: "hola" },
    ]);
    mocks.notify.mockRejectedValue(new Error("vapid roto"));

    const out = await notifyNewInboundMail(PARAMS);

    expect(out.notified).toBe(0);
    expect(mocks.captureEmailError).toHaveBeenCalled();
  });
});
