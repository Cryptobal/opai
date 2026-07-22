/**
 * Tests de resolveSenderAccount (B1/C02): la casilla remitente se resuelve
 * desde el hilo en replies (nunca findFirst) y desde la selección explícita
 * en composición nueva.
 *
 * Escenario clave dos-casillas: usuario con cuentas A y B conectadas responde
 * un hilo de B → siempre sale por B.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  threadFindFirst: vi.fn(),
  accountFindFirst: vi.fn(),
  accountFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findFirst: mocks.threadFindFirst },
    crmEmailAccount: {
      findFirst: mocks.accountFindFirst,
      findMany: mocks.accountFindMany,
    },
  },
}));

import { resolveSenderAccount } from "../sender-account";

const ACCOUNT_B = {
  id: "acc-b",
  tenantId: "t1",
  userId: "user-1",
  email: "b@empresa.cl",
  status: "active",
  accessTokenEncrypted: "x",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reply: la casilla es la dueña del hilo", () => {
  it("con dos casillas conectadas usa la del hilo, no la primera del usuario", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", emailAccountId: "acc-b" });
    mocks.accountFindFirst.mockResolvedValue(ACCOUNT_B);

    const result = await resolveSenderAccount({
      tenantId: "t1",
      userId: "user-1",
      threadId: "thr-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.account.id).toBe("acc-b");
    // La búsqueda de la cuenta va por el id del hilo, no por findFirst del usuario.
    expect(mocks.accountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "acc-b" }),
      }),
    );
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
  });

  it("403 si el hilo pertenece a la casilla de otro usuario", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", emailAccountId: "acc-b" });
    mocks.accountFindFirst.mockResolvedValue({ ...ACCOUNT_B, userId: "user-2" });

    const result = await resolveSenderAccount({
      tenantId: "t1",
      userId: "user-1",
      threadId: "thr-1",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("404 si el hilo no existe en el tenant", async () => {
    mocks.threadFindFirst.mockResolvedValue(null);
    const result = await resolveSenderAccount({
      tenantId: "t1",
      userId: "user-1",
      threadId: "thr-x",
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("400 si el hilo no tiene casilla o la casilla no está activa", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", emailAccountId: null });
    expect(
      await resolveSenderAccount({ tenantId: "t1", userId: "user-1", threadId: "thr-1" }),
    ).toMatchObject({ ok: false, status: 400 });

    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", emailAccountId: "acc-b" });
    mocks.accountFindFirst.mockResolvedValue(null);
    expect(
      await resolveSenderAccount({ tenantId: "t1", userId: "user-1", threadId: "thr-1" }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});

describe("composición nueva", () => {
  it("emailAccountId explícito validado contra el usuario de sesión", async () => {
    mocks.accountFindFirst.mockResolvedValue(ACCOUNT_B);
    const result = await resolveSenderAccount({
      tenantId: "t1",
      userId: "user-1",
      emailAccountId: "acc-b",
    });
    expect(result.ok).toBe(true);
    expect(mocks.accountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "acc-b", userId: "user-1" }),
      }),
    );
  });

  it("403 si la casilla explícita es de otro usuario (el where la excluye)", async () => {
    mocks.accountFindFirst.mockResolvedValue(null);
    const result = await resolveSenderAccount({
      tenantId: "t1",
      userId: "user-1",
      emailAccountId: "acc-ajena",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("una sola casilla conectada se usa como default", async () => {
    mocks.accountFindMany.mockResolvedValue([ACCOUNT_B]);
    const result = await resolveSenderAccount({ tenantId: "t1", userId: "user-1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.account.id).toBe("acc-b");
  });

  it("multi-cuenta sin selección explícita se rechaza (nunca findFirst)", async () => {
    mocks.accountFindMany.mockResolvedValue([
      { ...ACCOUNT_B, id: "acc-a", email: "a@empresa.cl" },
      ACCOUNT_B,
    ]);
    const result = await resolveSenderAccount({ tenantId: "t1", userId: "user-1" });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("sin casillas conectadas → Gmail no conectado", async () => {
    mocks.accountFindMany.mockResolvedValue([]);
    const result = await resolveSenderAccount({ tenantId: "t1", userId: "user-1" });
    expect(result).toMatchObject({ ok: false, status: 400, error: "Gmail no conectado" });
  });
});
