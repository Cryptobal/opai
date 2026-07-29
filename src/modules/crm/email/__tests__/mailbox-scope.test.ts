/**
 * Tests de alcance multicuenta: unificada, casilla propia, ajena → 403,
 * hilo ajeno → 404, sin casillas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  threadFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailAccount: { findMany: mocks.accountFindMany },
    crmEmailThread: { findFirst: mocks.threadFindFirst },
  },
}));

import {
  resolveMailboxScope,
  requireThreadMailbox,
} from "../mailbox-scope";
import {
  assignMailboxIdentity,
  uniquifyDisplayLabel,
  labelFromEmail,
} from "../mailbox-identity";

const ACC_A = {
  id: "acc-a",
  email: "carlos@gard.cl",
  color: "teal",
  displayLabel: "Gard",
  isDefault: true,
  sortIndex: 0,
  status: "active",
  grantedScopes: "gmail.modify",
  createdAt: new Date("2026-01-01"),
};
const ACC_B = {
  id: "acc-b",
  email: "ops@opai.cl",
  color: "violet",
  displayLabel: "Opai",
  isDefault: false,
  sortIndex: 1,
  status: "active",
  grantedScopes: "gmail.modify",
  createdAt: new Date("2026-01-02"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveMailboxScope", () => {
  it("sin casillas → ok con arrays vacíos", async () => {
    mocks.accountFindMany.mockResolvedValue([]);
    const result = await resolveMailboxScope({
      tenantId: "t1",
      userId: "u1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.accounts).toEqual([]);
      expect(result.scope.accountIds).toEqual([]);
      expect(result.scope.activeAccountId).toBeNull();
    }
  });

  it("sin accountId → alcance unificado con todas las casillas", async () => {
    mocks.accountFindMany.mockResolvedValue([ACC_A, ACC_B]);
    const result = await resolveMailboxScope({
      tenantId: "t1",
      userId: "u1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.accountIds).toEqual(["acc-a", "acc-b"]);
      expect(result.scope.activeAccountId).toBeNull();
      expect(result.scope.defaultAccountId).toBe("acc-a");
    }
  });

  it('accountId="all" → unificada', async () => {
    mocks.accountFindMany.mockResolvedValue([ACC_A, ACC_B]);
    const result = await resolveMailboxScope({
      tenantId: "t1",
      userId: "u1",
      requestedAccountId: "all",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scope.activeAccountId).toBeNull();
  });

  it("casilla propia → alcance de esa casilla", async () => {
    mocks.accountFindMany.mockResolvedValue([ACC_A, ACC_B]);
    const result = await resolveMailboxScope({
      tenantId: "t1",
      userId: "u1",
      requestedAccountId: "acc-b",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.accountIds).toEqual(["acc-b"]);
      expect(result.scope.activeAccountId).toBe("acc-b");
    }
  });

  it("casilla ajena → 403", async () => {
    mocks.accountFindMany.mockResolvedValue([ACC_A, ACC_B]);
    const result = await resolveMailboxScope({
      tenantId: "t1",
      userId: "u1",
      requestedAccountId: "acc-otro",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe("requireThreadMailbox", () => {
  it("hilo propio → ok con account", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      id: "thr-1",
      emailAccountId: "acc-b",
    });
    mocks.accountFindMany.mockResolvedValue([ACC_A, ACC_B]);
    const result = await requireThreadMailbox({
      tenantId: "t1",
      userId: "u1",
      threadId: "thr-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.thread.emailAccountId).toBe("acc-b");
      expect(result.account.id).toBe("acc-b");
    }
  });

  it("hilo de casilla ajena → 404 (no 403)", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      id: "thr-1",
      emailAccountId: "acc-otro",
    });
    mocks.accountFindMany.mockResolvedValue([ACC_A, ACC_B]);
    const result = await requireThreadMailbox({
      tenantId: "t1",
      userId: "u1",
      threadId: "thr-1",
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("hilo inexistente → 404", async () => {
    mocks.threadFindFirst.mockResolvedValue(null);
    const result = await requireThreadMailbox({
      tenantId: "t1",
      userId: "u1",
      threadId: "thr-x",
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(mocks.accountFindMany).not.toHaveBeenCalled();
  });
});

describe("assignMailboxIdentity", () => {
  it("primera casilla → isDefault + color teal + label del dominio", () => {
    const id = assignMailboxIdentity([], "carlos@gard.cl");
    expect(id.isDefault).toBe(true);
    expect(id.color).toBe("teal");
    expect(id.displayLabel).toBe("Gard");
    expect(id.sortIndex).toBe(0);
  });

  it("desambigua etiquetas del mismo dominio", () => {
    const first = assignMailboxIdentity([], "a@gard.cl");
    const second = assignMailboxIdentity(
      [{ color: first.color, displayLabel: first.displayLabel, sortIndex: 0 }],
      "b@gard.cl",
    );
    expect(second.displayLabel).toBe("Gard2");
    expect(second.isDefault).toBe(false);
    expect(second.color).not.toBe(first.color);
  });

  it("labelFromEmail y uniquify", () => {
    expect(labelFromEmail("x@opai.cl")).toBe("Opai");
    expect(uniquifyDisplayLabel("Gard", new Set(["Gard"]))).toBe("Gard2");
  });
});
