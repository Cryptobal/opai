/**
 * Tests para POST /api/webhook/gmail — verificación OIDC de Pub/Sub (V3).
 *
 * Cubre, en ambos estados del flag GMAIL_PUSH_OIDC_REQUIRED:
 *  - true: sin JWT → 403; JWT inválido → 403; SA equivocada → 403; JWT válido → 204 y encola.
 *  - false/ausente (transición): sin JWT → 204 y encola (solo log).
 *  - El token legacy de query se sigue exigiendo cuando está configurado.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

const afterMock = vi.hoisted(() => vi.fn());
const verifyIdTokenMock = vi.fn();
const accountFindMany = vi.fn();
const writeSyncStateMock = vi.fn();
const enqueueMock = vi.fn();
const processMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: afterMock,
  };
});

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdTokenMock;
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailAccount: { findMany: accountFindMany },
  },
}));

vi.mock("@/modules/crm/email/gmail-sync-state", () => ({
  writeSyncState: writeSyncStateMock,
}));

vi.mock("@/modules/crm/email/gmail-sync-queue", () => ({
  enqueueGmailSyncJob: enqueueMock,
  processGmailSyncJob: processMock,
}));

const { POST } = await import("../route");

const ENV_KEYS = [
  "GMAIL_PUSH_ENABLED",
  "GMAIL_PUSH_TOKEN",
  "GMAIL_PUSH_AUDIENCE",
  "GMAIL_PUSH_SA_EMAIL",
  "GMAIL_PUSH_OIDC_REQUIRED",
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const SA_EMAIL = "pubsub-sa@proj.iam.gserviceaccount.com";
const AUDIENCE = "https://opai.example/api/webhook/gmail";

function pushRequest(
  opts: { jwt?: string; token?: string; historyId?: unknown } = {},
): NextRequest {
  const data = Buffer.from(
    JSON.stringify({
      emailAddress: "casilla@gmail.com",
      historyId: opts.historyId ?? "777",
    }),
  ).toString("base64");
  const url = new URL("http://localhost/api/webhook/gmail");
  if (opts.token) url.searchParams.set("token", opts.token);
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.jwt ? { authorization: `Bearer ${opts.jwt}` } : {}),
    },
    body: JSON.stringify({ message: { data } }),
  });
}

function invalidPushRequest(): NextRequest {
  return new NextRequest("http://localhost/api/webhook/gmail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: {} }),
  });
}

function validTicket(overrides: Record<string, unknown> = {}) {
  return {
    getPayload: () => ({
      iss: "https://accounts.google.com",
      email: SA_EMAIL,
      email_verified: true,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  process.env.GMAIL_PUSH_ENABLED = "true";
  process.env.GMAIL_PUSH_AUDIENCE = AUDIENCE;
  process.env.GMAIL_PUSH_SA_EMAIL = SA_EMAIL;
  delete process.env.GMAIL_PUSH_TOKEN;
  delete process.env.GMAIL_PUSH_OIDC_REQUIRED;
  verifyIdTokenMock.mockReset();
  accountFindMany.mockReset().mockResolvedValue([{ id: "acc-1", tenantId: "t-1" }]);
  writeSyncStateMock.mockReset().mockResolvedValue(undefined);
  enqueueMock.mockReset().mockResolvedValue(undefined);
  processMock.mockReset().mockResolvedValue(undefined);
  afterMock.mockReset().mockImplementation((callback: () => unknown) => {
    void callback();
  });
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    const v = ORIGINAL_ENV[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("flag GMAIL_PUSH_OIDC_REQUIRED=true", () => {
  beforeEach(() => {
    process.env.GMAIL_PUSH_OIDC_REQUIRED = "true";
  });

  it("403 sin header Authorization", async () => {
    const res = await POST(pushRequest());
    expect(res.status).toBe(403);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("403 con JWT inválido (verifyIdToken lanza)", async () => {
    verifyIdTokenMock.mockRejectedValue(new Error("invalid signature"));
    const res = await POST(pushRequest({ jwt: "jwt-malo" }));
    expect(res.status).toBe(403);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("403 si el email del payload no es la SA esperada", async () => {
    verifyIdTokenMock.mockResolvedValue(validTicket({ email: "otra@sa.com" }));
    const res = await POST(pushRequest({ jwt: "jwt" }));
    expect(res.status).toBe(403);
  });

  it("403 si email_verified es false", async () => {
    verifyIdTokenMock.mockResolvedValue(validTicket({ email_verified: false }));
    const res = await POST(pushRequest({ jwt: "jwt" }));
    expect(res.status).toBe(403);
  });

  it("204 y encola con JWT válido (audience correcta)", async () => {
    verifyIdTokenMock.mockResolvedValue(validTicket());
    const res = await POST(pushRequest({ jwt: "jwt-valido" }));
    expect(res.status).toBe(204);
    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: "jwt-valido",
      audience: AUDIENCE,
    });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "acc-1", reason: "push" }),
    );
  });
});

describe("modo transición (flag ausente)", () => {
  it("acepta y encola sin JWT (solo loggea)", async () => {
    const res = await POST(pushRequest());
    expect(res.status).toBe(204);
    expect(enqueueMock).toHaveBeenCalled();
  });

  it("503 si falla el enqueue durable para que Pub/Sub reintente", async () => {
    enqueueMock.mockRejectedValue(new Error("database temporarily unavailable"));

    const res = await POST(pushRequest());

    expect(res.status).toBe(503);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "acc-1", reason: "push" }),
    );
    expect(processMock).not.toHaveBeenCalled();
  });

  it("503 si falla el estado previo al enqueue durable", async () => {
    writeSyncStateMock.mockRejectedValue(
      new Error("database temporarily unavailable"),
    );

    const res = await POST(pushRequest());

    expect(res.status).toBe(503);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(processMock).not.toHaveBeenCalled();
  });

  it("204 para payload inválido sin intentar persistir", async () => {
    const res = await POST(invalidPushRequest());

    expect(res.status).toBe(204);
    expect(accountFindMany).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("204 para casilla inexistente sin intentar encolar", async () => {
    accountFindMany.mockResolvedValue([]);

    const res = await POST(pushRequest());

    expect(res.status).toBe(204);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("204 si falla after porque el job ya quedó durable", async () => {
    afterMock.mockImplementation(() => {
      throw new Error("after unavailable");
    });

    const res = await POST(pushRequest());

    expect(res.status).toBe(204);
    expect(enqueueMock).toHaveBeenCalled();
    expect(processMock).not.toHaveBeenCalled();
  });

  it("acepta con JWT inválido", async () => {
    verifyIdTokenMock.mockRejectedValue(new Error("bad"));
    const res = await POST(pushRequest({ jwt: "x" }));
    expect(res.status).toBe(204);
    expect(enqueueMock).toHaveBeenCalled();
  });

  it("normaliza historyId numérico antes del enqueue", async () => {
    const res = await POST(pushRequest({ historyId: 987654 }));
    expect(res.status).toBe(204);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ historyId: "987654" }),
    );
  });

  it("encola igualmente cuando historyId es inválido", async () => {
    const res = await POST(pushRequest({ historyId: "not-a-history-id" }));
    expect(res.status).toBe(204);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        reason: "push",
        historyId: undefined,
      }),
    );
  });
});

describe("token legacy de query", () => {
  it("403 si GMAIL_PUSH_TOKEN está configurado y no coincide", async () => {
    process.env.GMAIL_PUSH_TOKEN = "secreto";
    const res = await POST(pushRequest({ token: "otro" }));
    expect(res.status).toBe(403);
  });

  it("204 si coincide (modo transición)", async () => {
    process.env.GMAIL_PUSH_TOKEN = "secreto";
    const res = await POST(pushRequest({ token: "secreto" }));
    expect(res.status).toBe(204);
  });
});
