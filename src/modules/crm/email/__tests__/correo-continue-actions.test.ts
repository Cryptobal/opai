import { describe, expect, it } from "vitest";
import { resolveContinueActions } from "../correo-continue-actions";

const now = new Date("2026-07-28T12:00:00Z");

describe("resolveContinueActions", () => {
  it("por defecto no incluye primary (el CTA héroe ya la muestra)", () => {
    const actions = resolveContinueActions({
      primaryTitle: "Armar la licitación",
      primaryExecuted: false,
      lastReadAt: null,
      messages: [{ sentAt: "2026-07-20T10:00:00Z" }],
      dealFechaEntrega: null,
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(actions.map((a) => a.id)).toEqual(["reply"]);
    expect(actions.some((a) => a.id === "primary")).toBe(false);
  });

  it("incluye primary solo con includePrimary: true", () => {
    const actions = resolveContinueActions({
      primaryTitle: "Armar la licitación",
      primaryExecuted: false,
      includePrimary: true,
      lastReadAt: null,
      messages: [{ sentAt: "2026-07-20T10:00:00Z" }],
      dealFechaEntrega: null,
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(actions.map((a) => a.id)).toEqual(["primary", "reply"]);
    expect(actions[0].label).toBe("Armar la licitación");
  });

  it("omite primary si ya se ejecutó aunque includePrimary sea true", () => {
    const actions = resolveContinueActions({
      primaryTitle: "Armar la licitación",
      primaryExecuted: true,
      includePrimary: true,
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: null,
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(actions.map((a) => a.id)).toEqual(["reply"]);
  });

  it("since-read solo si hay mensajes posteriores al cursor", () => {
    const withNewer = resolveContinueActions({
      lastReadAt: "2026-07-20T12:00:00Z",
      messages: [
        { sentAt: "2026-07-20T10:00:00Z" },
        { sentAt: "2026-07-21T10:00:00Z" },
      ],
      dealFechaEntrega: null,
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(withNewer.some((a) => a.id === "since-read")).toBe(true);

    const without = resolveContinueActions({
      lastReadAt: "2026-07-22T12:00:00Z",
      messages: [{ sentAt: "2026-07-21T10:00:00Z" }],
      dealFechaEntrega: null,
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(without.some((a) => a.id === "since-read")).toBe(false);
  });

  it("deadline solo si la fecha está entre −30 y +365 días", () => {
    const ok = resolveContinueActions({
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: "2026-08-05",
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(ok.find((a) => a.id === "deadline")?.label).toBe("Agendar cierre 05-08");

    const far = resolveContinueActions({
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: "2028-01-01",
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(far.some((a) => a.id === "deadline")).toBe(false);
  });

  it("attachments cuenta pendientes y se omite si degraded", () => {
    const pending = resolveContinueActions({
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: null,
      attachments: [{ savedFileId: null }, { savedFileId: "f1" }, {}],
      accountId: "acc-1",
      now,
    });
    expect(pending.find((a) => a.id === "attachments")?.label).toBe("Guardar 2 adjuntos");

    const degraded = resolveContinueActions({
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: null,
      attachments: [{ savedFileId: null }],
      degraded: true,
      accountId: "acc-1",
      now,
    });
    expect(degraded.some((a) => a.id === "attachments")).toBe(false);
  });

  it("associate solo sin cuenta", () => {
    const bare = resolveContinueActions({
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: null,
      attachments: [],
      accountId: null,
      now,
    });
    expect(bare.some((a) => a.id === "associate")).toBe(true);

    const linked = resolveContinueActions({
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: null,
      attachments: [],
      accountId: "acc-1",
      now,
    });
    expect(linked.some((a) => a.id === "associate")).toBe(false);
  });

  it("respeta el tope de cuatro acciones (sin primary por defecto)", () => {
    const actions = resolveContinueActions({
      primaryTitle: "Armar la licitación",
      lastReadAt: "2026-07-20T12:00:00Z",
      messages: [{ sentAt: "2026-07-21T10:00:00Z" }],
      dealFechaEntrega: "2026-08-05",
      attachments: [{ savedFileId: null }],
      accountId: null,
      now,
    });
    expect(actions).toHaveLength(4);
    expect(actions.map((a) => a.id)).toEqual([
      "since-read",
      "deadline",
      "attachments",
      "associate",
    ]);
  });

  it("con includePrimary el tope sigue siendo cuatro e incluye primary", () => {
    const actions = resolveContinueActions({
      primaryTitle: "Armar la licitación",
      includePrimary: true,
      lastReadAt: "2026-07-20T12:00:00Z",
      messages: [{ sentAt: "2026-07-21T10:00:00Z" }],
      dealFechaEntrega: "2026-08-05",
      attachments: [{ savedFileId: null }],
      accountId: null,
      now,
    });
    expect(actions).toHaveLength(4);
    expect(actions.map((a) => a.id)).toEqual([
      "primary",
      "since-read",
      "deadline",
      "attachments",
    ]);
  });

  it("oculta mutaciones si canEdit es false", () => {
    const actions = resolveContinueActions({
      primaryTitle: "Armar la licitación",
      includePrimary: true,
      lastReadAt: null,
      messages: [],
      dealFechaEntrega: null,
      attachments: [{ savedFileId: null }],
      accountId: null,
      canEdit: false,
      now,
    });
    expect(actions.map((a) => a.id)).toEqual(["reply"]);
  });
});
