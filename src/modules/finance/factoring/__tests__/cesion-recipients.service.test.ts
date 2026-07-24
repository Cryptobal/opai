/**
 * Tests de resolveCesionRecipients: la cadena de destinatarios del aviso de
 * cesión al deudor, SIN fallback a receiverEmail. Cubre cuenta null, opt-out,
 * con/sin contactos, dedup/orden y aislamiento por tenant en las queries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  accountFindMany: vi.fn(),
  contactFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmAccount: {
      findFirst: mocks.accountFindFirst,
      findMany: mocks.accountFindMany,
    },
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
  mocks.accountFindFirst.mockResolvedValue({
    id: "acc-1",
    cesionNotificarDeudor: true,
  });
  mocks.accountFindMany.mockResolvedValue([]);
  mocks.contactFindMany.mockResolvedValue([]);
});

describe("resolveCesionRecipients", () => {
  it("DTE sin cuenta CRM vinculada → NO_ACCOUNT, lista vacía", async () => {
    const res = await resolveCesionRecipients("t1", {
      crmAccountId: null,
      receiverRut: null,
    });
    expect(res).toEqual({
      emails: [],
      notificarDeudor: true,
      reason: "NO_ACCOUNT",
      contacts: [],
    });
    expect(mocks.accountFindFirst).not.toHaveBeenCalled();
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
    expect(mocks.contactFindMany).not.toHaveBeenCalled();
  });

  it("cuenta con opt-out conserva correos para el AEC pero no notifica", async () => {
    mocks.accountFindFirst.mockResolvedValue({
      id: "acc-1",
      cesionNotificarDeudor: false,
    });
    mocks.contactFindMany.mockResolvedValue([
      {
        id: "contact-1",
        firstName: "Ana",
        lastName: "Pago",
        email: "ana@cliente.cl",
        recibeCesion: true,
      },
    ]);
    const res = await resolveCesionRecipients("t1", {
      crmAccountId: "acc-1",
    });
    expect(res).toMatchObject({
      emails: ["ana@cliente.cl"],
      notificarDeudor: false,
      reason: "OPTED_OUT",
    });
  });

  it("cuenta sin contactos marcados → NO_CONTACTS, lista vacía", async () => {
    const res = await resolveCesionRecipients("t1", {
      crmAccountId: "acc-1",
    });
    expect(res).toEqual({
      emails: [],
      notificarDeudor: true,
      reason: "NO_CONTACTS",
      contacts: [],
    });
  });

  it("cuenta con contactos → CONFIGURED, dedup case-insensitive preservando orden", async () => {
    mocks.contactFindMany.mockResolvedValue([
      { id: "c1", firstName: "Pago", lastName: "", email: "Pago@Cliente.cl", recibeCesion: true },
      { id: "c2", firstName: "Duplicado", lastName: "", email: "pago@cliente.cl", recibeCesion: true },
      { id: "c3", firstName: "Tesorería", lastName: "", email: "  tesoreria@cliente.cl  ", recibeCesion: true },
      { id: "c4", firstName: "Sin", lastName: "Correo", email: null, recibeCesion: true },
      { id: "c5", firstName: "Inválido", lastName: "", email: "no-es-email", recibeCesion: true },
    ]);
    const res = await resolveCesionRecipients("t1", {
      crmAccountId: "acc-1",
    });
    expect(res.reason).toBe("CONFIGURED");
    expect(res.notificarDeudor).toBe(true);
    expect(res.emails).toEqual(["Pago@Cliente.cl", "tesoreria@cliente.cl"]);
    expect(res.contacts).toHaveLength(2);
  });

  it("aísla por tenant + cuenta en AMBAS queries (nunca sólo accountId)", async () => {
    mocks.accountFindFirst.mockResolvedValue({
      id: "acc-9",
      cesionNotificarDeudor: true,
    });
    mocks.contactFindMany.mockResolvedValue([
      { id: "c1", firstName: "X", lastName: "", email: "x@cliente.cl", recibeCesion: true },
    ]);
    await resolveCesionRecipients("tenant-A", {
      crmAccountId: "acc-9",
    });

    expect(mocks.accountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-9", tenantId: "tenant-A" },
      }),
    );
    const contactArgs = mocks.contactFindMany.mock.calls[0][0];
    expect(contactArgs.where).toMatchObject({
      tenantId: "tenant-A",
      accountId: "acc-9",
      email: { not: null },
    });
    expect(contactArgs.orderBy).toEqual([
      { isPrimary: "desc" },
      { createdAt: "asc" },
    ]);
  });

  it("cuenta inexistente en el tenant (posible cross-tenant) → NO_ACCOUNT", async () => {
    mocks.accountFindFirst.mockResolvedValue(null);
    const res = await resolveCesionRecipients("t1", {
      crmAccountId: "acc-de-otro-tenant",
    });
    expect(res).toEqual({
      emails: [],
      notificarDeudor: true,
      reason: "NO_ACCOUNT",
      contacts: [],
    });
    expect(mocks.contactFindMany).not.toHaveBeenCalled();
  });

  it("DTE histórico sin crmAccountId resuelve la cuenta por RUT normalizado", async () => {
    mocks.accountFindMany.mockResolvedValue([
      {
        id: "acc-rut",
        rut: "76.123.456-7",
        cesionNotificarDeudor: true,
      },
    ]);
    mocks.contactFindMany.mockResolvedValue([
      {
        id: "c1",
        firstName: "Cobranza",
        lastName: "",
        email: "cobranza@cliente.cl",
        recibeCesion: true,
      },
    ]);

    const res = await resolveCesionRecipients("t1", {
      crmAccountId: null,
      receiverRut: "76123456-7",
    });

    expect(res.emails).toEqual(["cobranza@cliente.cl"]);
    expect(mocks.contactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          accountId: "acc-rut",
        }),
      }),
    );
  });
});

const RESOLVED = (over: Partial<CesionRecipientsResult>): CesionRecipientsResult => ({
  emails: [],
  notificarDeudor: true,
  reason: "NO_CONTACTS",
  contacts: [],
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
