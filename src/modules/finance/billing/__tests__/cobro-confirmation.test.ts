import { describe, it, expect, beforeEach, vi } from "vitest";

// Holder mutable (hoist-safe) para inyectar un prisma distinto por test.
const h = vi.hoisted(() => ({
  current: null as unknown as ReturnType<typeof buildHarness>,
}));

// Mock de prisma: delega en el harness activo.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findFirst: (...a: unknown[]) => h.current.prisma.financeDte.findFirst(...a),
      findUnique: (...a: unknown[]) => h.current.prisma.financeDte.findUnique(...a),
      update: (...a: unknown[]) => h.current.prisma.financeDte.update(...a),
    },
    financeDteClientEvent: {
      create: (...a: unknown[]) => h.current.prisma.financeDteClientEvent.create(...a),
    },
  },
}));

// Cortamos la notificación interna (evita cargar resend/send-tenant-email).
vi.mock("@/modules/finance/billing/cobro-notify", () => ({
  notifyClientAction: vi.fn(async () => {}),
}));
vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: vi.fn(async () => ({
    commercialName: "Emisor",
    companyName: "Emisor SpA",
    brandingLogoFull: "",
    emailContact: "finanzas@emisor.cl",
    email: "finanzas@emisor.cl",
  })),
}));
vi.mock("@/modules/finance/billing/billing-doc-config.service", () => ({
  resolveBrandColors: vi.fn(async () => ({ primary: "brand", secondary: "brand2" })),
}));

import {
  approveCobro,
  rejectCobro,
  addClientReference,
  getPublicCobroView,
  CobroError,
} from "../cobro-confirmation.service";

const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 32 chars, matcha TOKEN_RE

type DteState = Record<string, unknown>;

function unwrap(data: Record<string, unknown>): Record<string, unknown> {
  // Nuestras updates solo setean escalares/arrays; no hay increment aquí.
  return data;
}

function buildHarness(overrides: DteState = {}) {
  const dte: DteState = {
    id: "dte-1",
    tenantId: "tenant-1",
    clientActionToken: TOKEN,
    clientActionTokenExp: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    requireProforma: true,
    requireEstadoPago: false,
    proformaStatus: "SENT",
    estadoPagoStatus: "NONE",
    folio: 0,
    siiStatus: "DRAFT",
    additionalReferences: null,
    notes: null,
    issuerName: "Emisor SpA",
    issuerRut: "11111111-1",
    receiverName: "Cliente Ltda",
    billingPeriod: "2026-07",
    date: new Date(Date.UTC(2026, 6, 1)),
    netAmount: 100000,
    taxAmount: 19000,
    totalAmount: 119000,
    currency: "CLP",
    ...overrides,
  };
  const events: Array<Record<string, unknown>> = [];
  const prisma = {
    financeDte: {
      findFirst: vi.fn(async ({ where }: { where: DteState }) => {
        if (where.clientActionToken !== undefined)
          return where.clientActionToken === dte.clientActionToken ? dte : null;
        if (where.id !== undefined) {
          const okTenant = where.tenantId === undefined || where.tenantId === dte.tenantId;
          return where.id === dte.id && okTenant ? dte : null;
        }
        return null;
      }),
      findUnique: vi.fn(async ({ where }: { where: DteState }) =>
        where.id === dte.id
          ? { additionalReferences: dte.additionalReferences, notes: dte.notes }
          : null,
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(dte, unwrap(data));
        return dte;
      }),
    },
    financeDteClientEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return data;
      }),
    },
  };
  return { dte, events, prisma };
}

function setHarness(overrides: DteState = {}) {
  h.current = buildHarness(overrides);
  return h.current;
}

beforeEach(() => {
  setHarness();
});

describe("getPublicCobroView", () => {
  it("token inexistente → null", async () => {
    const view = await getPublicCobroView("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    expect(view).toBeNull();
  });

  it("VIEWED solo desde SENT: primera apertura mueve SENT → VIEWED + evento", async () => {
    const H = h.current;
    const view = await getPublicCobroView(TOKEN, { ip: "1.2.3.4", ua: "UA" });
    expect(view?.status).toBe("VIEWED");
    expect(H.dte.proformaStatus).toBe("VIEWED");
    const viewedEvents = H.events.filter((e) => e.action === "VIEWED");
    expect(viewedEvents).toHaveLength(1);
  });

  it("no degrada APPROVED a VIEWED", async () => {
    const H = setHarness({ proformaStatus: "APPROVED" });
    const view = await getPublicCobroView(TOKEN);
    expect(view?.status).toBe("APPROVED");
    expect(H.events.filter((e) => e.action === "VIEWED")).toHaveLength(0);
  });
});

describe("approveCobro", () => {
  it("token expirado → CobroError EXPIRED", async () => {
    setHarness({ clientActionTokenExp: new Date(Date.now() - 1000) });
    await expect(approveCobro(TOKEN)).rejects.toBeInstanceOf(CobroError);
    await expect(approveCobro(TOKEN)).rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("documento ya facturado bloquea la aprobación", async () => {
    setHarness({ folio: 42, siiStatus: "ACCEPTED" });
    await expect(approveCobro(TOKEN)).rejects.toMatchObject({ code: "ALREADY_ISSUED" });
  });

  it("aprueba y agrega OC como referencia 801, sin duplicar", async () => {
    const H = h.current;
    const view = await approveCobro(TOKEN, { ocFolio: "OC-123", actorEmail: "cliente@x.cl" });
    expect(H.dte.proformaStatus).toBe("APPROVED");
    expect(view.status).toBe("APPROVED");
    expect(view.references).toEqual([{ tipoDocRef: "801", folioRef: "OC-123" }]);

    // Segundo intento con la misma OC → no duplica.
    const view2 = await addClientReference(TOKEN, { ocFolio: "OC-123" });
    expect(view2.references).toEqual([{ tipoDocRef: "801", folioRef: "OC-123" }]);
  });
});

describe("rejectCobro", () => {
  it("exige comentario no vacío", async () => {
    await expect(rejectCobro(TOKEN, { comment: "   " })).rejects.toMatchObject({
      code: "COMMENT_REQUIRED",
    });
  });

  it("observa con comentario → REJECTED + evento", async () => {
    const H = h.current;
    const view = await rejectCobro(TOKEN, { comment: "Falta el detalle del período" });
    expect(H.dte.proformaStatus).toBe("REJECTED");
    expect(view.status).toBe("REJECTED");
    const rej = H.events.find((e) => e.action === "REJECTED");
    expect(rej?.comment).toBe("Falta el detalle del período");
  });
});

describe("addClientReference", () => {
  it("permitido post-APPROVED: agrega OC 801", async () => {
    const H = setHarness({ proformaStatus: "APPROVED" });
    const view = await addClientReference(TOKEN, { ocFolio: "OC-999" });
    expect(view.references).toEqual([{ tipoDocRef: "801", folioRef: "OC-999" }]);
    expect(H.events.some((e) => e.action === "OC_ADDED" && e.ocFolio === "OC-999")).toBe(true);
  });

  it("sin OC ni referencia → NOTHING_TO_ADD", async () => {
    await expect(addClientReference(TOKEN, {})).rejects.toMatchObject({
      code: "NOTHING_TO_ADD",
    });
  });

  it("bloqueado si el documento ya fue facturado", async () => {
    setHarness({ folio: 7, siiStatus: "ACCEPTED", proformaStatus: "APPROVED" });
    await expect(addClientReference(TOKEN, { ocFolio: "OC-1" })).rejects.toMatchObject({
      code: "ALREADY_ISSUED",
    });
  });
});
