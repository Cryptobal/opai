/**
 * Tests para GET/DELETE /api/crm/gmail/accounts.
 *
 * Cubre:
 *  - GET usuario sin rol elevado → solo casillas propias (filtro userId).
 *  - GET owner/admin → todas las del tenant, anotadas con ownerEmail.
 *  - DELETE de casilla ajena sin rol elevado → 403 (no revoca ni actualiza).
 *  - DELETE de casilla propia → 200, revoca el grant en Google y borra tokens.
 *  - DELETE de casilla ajena como admin → 200.
 *  - Revocación upstream falla → desconexión local igual procede (upstreamRevoked=false).
 *  - Secreto ausente o ciphertext corrupto → desconexión local igual procede.
 *  - Permiso CRM bloqueado (requireCrmView) → 403.
 *  - Casilla inexistente → 404; sin id → 400.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import type { NextRequest } from "next/server";
import { encryptText } from "@/lib/crypto";

const requireAuthMock = vi.fn();
const requireCrmViewMock = vi.fn();
const accountFindMany = vi.fn();
const accountFindFirst = vi.fn();
const accountUpdate = vi.fn();
const accountUpdateMany = vi.fn();
const adminFindMany = vi.fn();
const transactionMock = vi.fn();
const stopGmailWatchMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
  unauthorized: () =>
    new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/require-module", () => ({
  requireTenantModule: vi.fn().mockResolvedValue({ authorized: true }),
}));

vi.mock("@/lib/api-auth-crm", () => ({
  requireCrmView: requireCrmViewMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailAccount: {
      findMany: accountFindMany,
      findFirst: accountFindFirst,
      update: accountUpdate,
      updateMany: accountUpdateMany,
    },
    admin: {
      findMany: adminFindMany,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/modules/crm/email/gmail-watch", () => ({
  stopGmailWatch: stopGmailWatchMock,
}));

// Import dinámico: los factories de vi.mock se hoistean y un import estático
// de la ruta se evaluaría antes de inicializar los vi.fn() de arriba.
const { GET, DELETE } = await import("../route");

const SECRET = "secreto-de-test";
const ORIGINAL_SECRET = process.env.GMAIL_TOKEN_SECRET;

const CTX_EDITOR = {
  userId: "user-1",
  tenantId: "tenant-1",
  userEmail: "editor@acme.cl",
  userRole: "editor",
  roleTemplateId: null,
};
const CTX_ADMIN = { ...CTX_EDITOR, userId: "admin-1", userEmail: "admin@acme.cl", userRole: "admin" };

function deleteRequest(id?: string): NextRequest {
  const url = id
    ? `http://x/api/crm/gmail/accounts?id=${encodeURIComponent(id)}`
    : "http://x/api/crm/gmail/accounts";
  return new Request(url, { method: "DELETE" }) as unknown as NextRequest;
}

function ownAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    email: "casilla@gmail.com",
    userId: "user-1",
    isDefault: false,
    syncState: null,
    accessTokenEncrypted: encryptText("access-plain", SECRET),
    refreshTokenEncrypted: encryptText("refresh-plain", SECRET),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.GMAIL_TOKEN_SECRET = SECRET;
  requireAuthMock.mockReset();
  requireCrmViewMock.mockReset().mockResolvedValue(null);
  accountFindMany.mockReset();
  accountFindFirst.mockReset();
  accountUpdate.mockReset().mockResolvedValue({});
  accountUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  transactionMock.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      crmEmailAccount: {
        findFirst: accountFindFirst,
        update: accountUpdate,
        updateMany: accountUpdateMany,
      },
    }),
  );
  adminFindMany.mockReset();
  stopGmailWatchMock.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.GMAIL_TOKEN_SECRET;
  } else {
    process.env.GMAIL_TOKEN_SECRET = ORIGINAL_SECRET;
  }
});

describe("GET /api/crm/gmail/accounts", () => {
  it("usuario sin rol elevado solo ve sus casillas (filtro por userId)", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindMany.mockResolvedValue([
      { id: "acc-1", email: "casilla@gmail.com", status: "active", userId: "user-1", updatedAt: new Date() },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(accountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", provider: "gmail", userId: "user-1" },
      }),
    );
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0].ownerEmail).toBeUndefined();
    expect(adminFindMany).not.toHaveBeenCalled();
  });

  it("admin ve todas las casillas del tenant con email del dueño", async () => {
    requireAuthMock.mockResolvedValue(CTX_ADMIN);
    accountFindMany.mockResolvedValue([
      { id: "acc-1", email: "casilla@gmail.com", status: "active", userId: "user-1", updatedAt: new Date() },
      { id: "acc-2", email: "otra@gmail.com", status: "active", userId: "user-2", updatedAt: new Date() },
    ]);
    adminFindMany.mockResolvedValue([
      { id: "user-1", email: "editor@acme.cl" },
      { id: "user-2", email: "vendedora@acme.cl" },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(accountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", provider: "gmail" },
      }),
    );
    expect(body.accounts.map((a: { ownerEmail: string }) => a.ownerEmail)).toEqual([
      "editor@acme.cl",
      "vendedora@acme.cl",
    ]);
  });
});

describe("DELETE /api/crm/gmail/accounts", () => {
  it("400 sin id", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(400);
  });

  it("404 si la casilla no existe en el tenant", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(null);
    const res = await DELETE(deleteRequest("acc-x"));
    expect(res.status).toBe(404);
    expect(accountUpdate).not.toHaveBeenCalled();
  });

  it("403 al desconectar casilla ajena sin rol elevado (sin revocar ni tocar tokens)", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(ownAccount({ userId: "user-2" }));

    const res = await DELETE(deleteRequest("acc-1"));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(accountUpdate).not.toHaveBeenCalled();
    expect(stopGmailWatchMock).not.toHaveBeenCalled();
  });

  it("dueño desconecta su casilla: revoca en Google con el refresh token y borra tokens", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(ownAccount());

    const res = await DELETE(deleteRequest("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, email: "casilla@gmail.com", upstreamRevoked: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [revokeUrl, init] = fetchMock.mock.calls[0];
    expect(revokeUrl).toBe("https://oauth2.googleapis.com/revoke");
    expect(init.body).toContain(`token=${encodeURIComponent("refresh-plain")}`);

    expect(stopGmailWatchMock).toHaveBeenCalledTimes(1);
    expect(accountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: {
        status: "revoked",
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        isDefault: false,
      },
    });
  });

  it("admin puede desconectar casillas ajenas", async () => {
    requireAuthMock.mockResolvedValue(CTX_ADMIN);
    accountFindFirst.mockResolvedValue(ownAccount({ userId: "user-2" }));

    const res = await DELETE(deleteRequest("acc-1"));

    expect(res.status).toBe(200);
    expect(accountUpdate).toHaveBeenCalled();
  });

  it("sin refresh token revoca con el access token", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(ownAccount({ refreshTokenEncrypted: null }));

    const res = await DELETE(deleteRequest("acc-1"));
    const body = await res.json();

    expect(body.upstreamRevoked).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toContain(`token=${encodeURIComponent("access-plain")}`);
    expect(res.status).toBe(200);
  });

  it("si Google rechaza la revocación, la desconexión local igual procede", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(ownAccount());
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));

    const res = await DELETE(deleteRequest("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.upstreamRevoked).toBe(false);
    expect(accountUpdate).toHaveBeenCalled();
  });

  it("si la red falla al revocar, la desconexión local igual procede", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(ownAccount());
    fetchMock.mockRejectedValue(new Error("network down"));

    const res = await DELETE(deleteRequest("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.upstreamRevoked).toBe(false);
    expect(accountUpdate).toHaveBeenCalled();
  });

  it("403 si el permiso CRM del usuario lo bloquea (requireCrmView)", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    requireCrmViewMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Sin permisos para ver CRM" }), { status: 403 }),
    );

    const res = await DELETE(deleteRequest("acc-1"));

    expect(res.status).toBe(403);
    expect(accountFindFirst).not.toHaveBeenCalled();
    expect(accountUpdate).not.toHaveBeenCalled();
  });

  it("sin GMAIL_TOKEN_SECRET la desconexión local procede (fail-closed no bloquea el cleanup)", async () => {
    delete process.env.GMAIL_TOKEN_SECRET;
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(ownAccount());

    const res = await DELETE(deleteRequest("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.upstreamRevoked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(accountUpdate).toHaveBeenCalled();
  });

  it("con ciphertext corrupto (decrypt lanza) la desconexión local procede", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(
      ownAccount({
        refreshTokenEncrypted: Buffer.from("basura-no-descifrable").toString("base64"),
      }),
    );

    const res = await DELETE(deleteRequest("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.upstreamRevoked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(accountUpdate).toHaveBeenCalled();
  });

  it("sin tokens almacenados no llama a Google pero desconecta igual", async () => {
    requireAuthMock.mockResolvedValue(CTX_EDITOR);
    accountFindFirst.mockResolvedValue(
      ownAccount({ accessTokenEncrypted: null, refreshTokenEncrypted: null }),
    );

    const res = await DELETE(deleteRequest("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.upstreamRevoked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(accountUpdate).toHaveBeenCalled();
  });
});
