/**
 * Tests del endpoint unificado `materializeAndAct`. Mockea Prisma y el
 * resolver de UF para validar el flujo "materializa-on-action" sin DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowItem: { findFirst: vi.fn() },
    financeCashflowOccurrence: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../uf-resolver", () => ({
  resolveUfForOccurrence: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { resolveUfForOccurrence } from "../uf-resolver";
import { materializeAndAct } from "../occurrence.service";

const TENANT = "tenant-1";
const TENANT_B = "tenant-2";
const ITEM_ID = "item-1";
const ORIGINAL_DATE = new Date("2026-06-05");

type Mock = ReturnType<typeof vi.fn>;

function setItem(overrides: Record<string, unknown> = {}) {
  (prisma.financeCashflowItem.findFirst as Mock).mockResolvedValue({
    id: ITEM_ID,
    amount: 1_000_000,
    currency: "CLP",
    ufFixingPolicy: null,
    ufFixingDay: null,
    ...overrides,
  });
}

function setExistingOccurrence(overrides: Record<string, unknown> = {}) {
  (prisma.financeCashflowOccurrence.upsert as Mock).mockResolvedValue({
    id: "occ-1",
    itemId: ITEM_ID,
    scheduledDate: ORIGINAL_DATE,
    amountClp: 1_000_000,
    status: "PROJECTED",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue(null);
  (prisma.financeCashflowOccurrence.update as Mock).mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      itemId: ITEM_ID,
      scheduledDate: ORIGINAL_DATE,
      amountClp: 1_000_000,
      status: "PROJECTED",
      ...data,
    }),
  );
});

describe("materializeAndAct", () => {
  it("upsert: create cuando no existe — usa item.amount como amountClp base, status=PROJECTED", async () => {
    setItem();
    setExistingOccurrence();

    await materializeAndAct(TENANT, {
      action: "move",
      itemId: ITEM_ID,
      originalDate: ORIGINAL_DATE,
      daysFromCurrent: 7,
    });

    const upsertCall = (prisma.financeCashflowOccurrence.upsert as Mock).mock.calls[0][0];
    expect(upsertCall.where).toEqual({
      itemId_scheduledDate: { itemId: ITEM_ID, scheduledDate: ORIGINAL_DATE },
    });
    expect(upsertCall.create.tenantId).toBe(TENANT);
    expect(upsertCall.create.itemId).toBe(ITEM_ID);
    expect(upsertCall.create.amountClp).toBe(1_000_000);
    expect(upsertCall.create.status).toBe("PROJECTED");
    // update vacío para preservar overrides previos
    expect(upsertCall.update).toEqual({});
  });

  it("upsert idempotente: segunda llamada con la misma (itemId, originalDate) NO sobreescribe data", async () => {
    setItem();
    setExistingOccurrence();
    await materializeAndAct(TENANT, {
      action: "amount",
      itemId: ITEM_ID,
      originalDate: ORIGINAL_DATE,
      amountClp: 500_000,
    });
    const upsertCall = (prisma.financeCashflowOccurrence.upsert as Mock).mock.calls[0][0];
    expect(upsertCall.update).toEqual({});
  });

  it("UF: usa resolveUfForOccurrence para computar amountClpBase y guarda ufValueUsed", async () => {
    setItem({ currency: "UF", amount: 100, ufFixingPolicy: "RUN_DAY" });
    (resolveUfForOccurrence as Mock).mockResolvedValue(37_500);
    setExistingOccurrence({ amountClp: 3_750_000 });

    await materializeAndAct(TENANT, {
      action: "move",
      itemId: ITEM_ID,
      originalDate: ORIGINAL_DATE,
      daysFromCurrent: 1,
    });

    expect(resolveUfForOccurrence).toHaveBeenCalledWith("RUN_DAY", null, ORIGINAL_DATE);
    const upsertCall = (prisma.financeCashflowOccurrence.upsert as Mock).mock.calls[0][0];
    expect(upsertCall.create.amountClp).toBe(3_750_000);
    expect(upsertCall.create.ufValueUsed).toBe(37_500);
  });

  it("move sobre virgen + daysFromCurrent: crea + ajusta scheduledDate y effectiveDate", async () => {
    setItem();
    setExistingOccurrence();
    await materializeAndAct(TENANT, {
      action: "move",
      itemId: ITEM_ID,
      originalDate: ORIGINAL_DATE,
      daysFromCurrent: 7,
    });
    const updateCall = (prisma.financeCashflowOccurrence.update as Mock).mock.calls[0][0];
    const target = updateCall.data.scheduledDate as Date;
    expect(target.toISOString().slice(0, 10)).toBe("2026-06-12");
    expect((updateCall.data.effectiveDate as Date).toISOString().slice(0, 10)).toBe("2026-06-12");
  });

  it("move sobre virgen + newDate: usa la fecha absoluta", async () => {
    setItem();
    setExistingOccurrence();
    const newDate = new Date("2026-07-15");
    await materializeAndAct(TENANT, {
      action: "move",
      itemId: ITEM_ID,
      originalDate: ORIGINAL_DATE,
      newDate,
    });
    const updateCall = (prisma.financeCashflowOccurrence.update as Mock).mock.calls[0][0];
    expect((updateCall.data.scheduledDate as Date).toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("amount sobre virgen: crea + setea amountOverride y amountClp", async () => {
    setItem();
    setExistingOccurrence();
    await materializeAndAct(TENANT, {
      action: "amount",
      itemId: ITEM_ID,
      originalDate: ORIGINAL_DATE,
      amountClp: 2_500_000,
    });
    const updateCall = (prisma.financeCashflowOccurrence.update as Mock).mock.calls[0][0];
    expect(updateCall.data.amountOverride).toBe(2_500_000);
    expect(updateCall.data.amountClp).toBe(2_500_000);
  });

  it("move bloqueado si status=PAID", async () => {
    setItem();
    setExistingOccurrence({ status: "PAID" });
    await expect(
      materializeAndAct(TENANT, {
        action: "move",
        itemId: ITEM_ID,
        originalDate: ORIGINAL_DATE,
        daysFromCurrent: 7,
      }),
    ).rejects.toThrow(/pagada|conciliada/i);
  });

  it("amount bloqueado si status=PAID", async () => {
    setItem();
    setExistingOccurrence({ status: "PAID" });
    await expect(
      materializeAndAct(TENANT, {
        action: "amount",
        itemId: ITEM_ID,
        originalDate: ORIGINAL_DATE,
        amountClp: 500_000,
      }),
    ).rejects.toThrow(/conciliada/i);
  });

  it("colisión rechazada: otra occurrence del mismo item ya existe en la fecha destino", async () => {
    setItem();
    setExistingOccurrence();
    // Colisión solo en la fecha destino; las sondas posteriores (búsqueda de
    // fecha libre para la sugerencia) caen al default null del beforeEach.
    (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValueOnce({
      id: "occ-other",
    });
    await expect(
      materializeAndAct(TENANT, {
        action: "move",
        itemId: ITEM_ID,
        originalDate: ORIGINAL_DATE,
        daysFromCurrent: 7,
      }),
    ).rejects.toThrow(/ya existe/i);
  });

  it("multi-tenant: si el item no pertenece al tenant, falla con item no encontrado", async () => {
    (prisma.financeCashflowItem.findFirst as Mock).mockResolvedValue(null);
    await expect(
      materializeAndAct(TENANT_B, {
        action: "move",
        itemId: ITEM_ID,
        originalDate: ORIGINAL_DATE,
        daysFromCurrent: 1,
      }),
    ).rejects.toThrow(/no encontrado/i);
    expect(prisma.financeCashflowOccurrence.upsert).not.toHaveBeenCalled();
  });

  it("amount inválido (negativo) lanza error", async () => {
    setItem();
    setExistingOccurrence();
    await expect(
      materializeAndAct(TENANT, {
        action: "amount",
        itemId: ITEM_ID,
        originalDate: ORIGINAL_DATE,
        amountClp: -100,
      }),
    ).rejects.toThrow();
  });

  it("colisión NO se chequea si target == originalDate (no-op move)", async () => {
    setItem();
    setExistingOccurrence();
    await materializeAndAct(TENANT, {
      action: "move",
      itemId: ITEM_ID,
      originalDate: ORIGINAL_DATE,
      daysFromCurrent: 0,
    });
    expect(prisma.financeCashflowOccurrence.findFirst).not.toHaveBeenCalled();
  });
});
