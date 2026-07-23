/**
 * Tests de resolveCesionRecipients: la cadena de destinatarios del aviso de
 * cesión al deudor, SIN fallback a receiverEmail. Cubre cuenta null, opt-out,
 * con/sin contactos, dedup/orden y aislamiento por tenant en las queries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmAccount: { findFirst: mocks.accountFindFirst },
    crmContact: { findMany: mocks.contactFindMany },
  },
}));

import {
  resolveCesionRecipients,
  decideCesionAviso,
  type CesionRecipientsResult,
} from "../cesion-recipients.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountFindFirst.mockResolvedValue({ cesionNotificarDeudor: true });
  mocks.contactFindMany.mockResolvedValue([]);
});

describe("resolveCesionRecipients", () => {
  it("DTE sin cuenta CRM vinculada → NO_ACCOUNT, lista vacía", async () => {
    const res = await resolveCesionRecipients("t1", { accountId: null });
    expect(res).toEqual({ emails: [], notificarDeudor: true, reason: "NO_ACCOUNT" });
    expect(mocks.accountFindFirst).not.toHaveBeenCalled();
    expect(mocks.contactFindMany).not.toHaveBeenCalled();
  });

  it("cuenta con opt-out (cesionNotificarDeudor=false) → OPTED_OUT, no consulta contactos", async () => {
    mocks.accountFindFirst.mockResolvedValue({ cesionNotificarDeudor: false });
    const res = await resolveCesionRecipients("t1", { accountId: "acc-1" });
    expect(res).toEqual({ emails: [], notificarDeudor: false, reason: "OPTED_OUT" });
    expect(mocks.contactFindMany).not.toHaveBeenCalled();
  });

  it("cuenta sin contactos marcados → NO_CONTACTS, lista vacía", async () => {
    const res = await resolveCesionRecipients("t1", { accountId: "acc-1" });
    expect(res).toEqual({ emails: [], notificarDeudor: true, reason: "NO_CONTACTS" });
  });

  it("cuenta con contactos → CONFIGURED, dedup case-insensitive preservando orden", async () => {
    mocks.contactFindMany.mockResolvedValue([
      { email: "Pago@Cliente.cl" },
      { email: "pago@cliente.cl" }, // duplicado (case-insensitive)
      { email: "  tesoreria@cliente.cl  " }, // se recorta
      { email: null }, // se descarta
      { email: "no-es-email" }, // inválido, se descarta
    ]);
    const res = await resolveCesionRecipients("t1", { accountId: "acc-1" });
    expect(res.reason).toBe("CONFIGURED");
    expect(res.notificarDeudor).toBe(true);
    expect(res.emails).toEqual(["Pago@Cliente.cl", "tesoreria@cliente.cl"]);
  });

  it("aísla por tenant + cuenta en AMBAS queries (nunca sólo accountId)", async () => {
    mocks.contactFindMany.mockResolvedValue([{ email: "x@cliente.cl" }]);
    await resolveCesionRecipients("tenant-A", { accountId: "acc-9" });

    expect(mocks.accountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-9", tenantId: "tenant-A" },
      }),
    );
    const contactArgs = mocks.contactFindMany.mock.calls[0][0];
    expect(contactArgs.where).toMatchObject({
      tenantId: "tenant-A",
      accountId: "acc-9",
      recibeCesion: true,
      email: { not: null },
    });
    expect(contactArgs.orderBy).toEqual([
      { isPrimary: "desc" },
      { createdAt: "asc" },
    ]);
  });

  it("cuenta inexistente en el tenant (posible cross-tenant) → NO_ACCOUNT", async () => {
    mocks.accountFindFirst.mockResolvedValue(null);
    const res = await resolveCesionRecipients("t1", { accountId: "acc-de-otro-tenant" });
    expect(res).toEqual({ emails: [], notificarDeudor: true, reason: "NO_ACCOUNT" });
    expect(mocks.contactFindMany).not.toHaveBeenCalled();
  });
});

const RESOLVED = (over: Partial<CesionRecipientsResult>): CesionRecipientsResult => ({
  emails: [],
  notificarDeudor: true,
  reason: "NO_CONTACTS",
  ...over,
});

describe("decideCesionAviso", () => {
  it("lista explícita del modal manda sobre CRM (dedup, notificar por defecto)", () => {
    const d = decideCesionAviso({
      explicitEmails: ["A@x.cl", "a@x.cl", "b@x.cl"],
      resolved: null,
    });
    expect(d.deudorEmailList).toEqual(["A@x.cl", "b@x.cl"]);
    expect(d.notificarDeudor).toBe(true);
    expect(d.willSend).toBe(true);
    expect(d.reason).toBe("EXPLICIT");
  });

  it("lista explícita vacía = no notificar a nadie", () => {
    const d = decideCesionAviso({ explicitEmails: [], resolved: null });
    expect(d.deudorEmailList).toEqual([]);
    expect(d.willSend).toBe(false);
  });

  it("opt-out explícito NO vacía la lista (el <eMailDeudor> del AEC se conserva para Octava)", () => {
    const d = decideCesionAviso({
      explicitEmails: ["deudor@x.cl"],
      explicitNotificar: false,
      resolved: null,
    });
    expect(d.deudorEmailList).toEqual(["deudor@x.cl"]);
    expect(d.notificarDeudor).toBe(false);
    expect(d.willSend).toBe(false);
  });

  it("sin lista explícita usa la resolución CRM (CONFIGURED → envía)", () => {
    const d = decideCesionAviso({
      resolved: RESOLVED({ emails: ["cfg@x.cl"], reason: "CONFIGURED" }),
    });
    expect(d.deudorEmailList).toEqual(["cfg@x.cl"]);
    expect(d.willSend).toBe(true);
    expect(d.reason).toBe("CONFIGURED");
  });

  it("sin contactos configurados NO cae a receiverEmail: lista vacía, no envía", () => {
    const d = decideCesionAviso({ resolved: RESOLVED({ reason: "NO_CONTACTS" }) });
    expect(d.deudorEmailList).toEqual([]);
    expect(d.willSend).toBe(false);
  });

  it("cliente con opt-out (OPTED_OUT) suprime el envío", () => {
    const d = decideCesionAviso({
      resolved: RESOLVED({ notificarDeudor: false, reason: "OPTED_OUT" }),
    });
    expect(d.notificarDeudor).toBe(false);
    expect(d.willSend).toBe(false);
  });

  it("override de operación puede reactivar el envío sobre el opt-out del cliente", () => {
    const d = decideCesionAviso({
      explicitNotificar: true,
      resolved: RESOLVED({ emails: ["cfg@x.cl"], notificarDeudor: false, reason: "OPTED_OUT" }),
    });
    expect(d.notificarDeudor).toBe(true);
    expect(d.willSend).toBe(true);
  });
});
