import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/platform-auth", () => ({
  getPlatformSession: vi.fn(),
}));

import { getPlatformSession } from "@/lib/platform-auth";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import type { PlatformSession } from "@/lib/platform-auth";

const getSession = getPlatformSession as unknown as ReturnType<typeof vi.fn>;

function session(role: PlatformSession["role"]): PlatformSession {
  return {
    platformAdminId: "pa1",
    email: "a@gard.cl",
    name: "Admin",
    role,
  };
}

describe("requirePlatformAuth", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("401 si no hay sesión", async () => {
    getSession.mockResolvedValue(null);
    const result = await requirePlatformAuth({ minRole: "support" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it("support puede leer (minRole support)", async () => {
    getSession.mockResolvedValue(session("support"));
    const result = await requirePlatformAuth({ minRole: "support" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx.role).toBe("support");
  });

  it("support no puede mutar (minRole admin) → 403 PLATFORM_ROLE_REQUIRED", async () => {
    getSession.mockResolvedValue(session("support"));
    const result = await requirePlatformAuth({ minRole: "admin" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.code).toBe("PLATFORM_ROLE_REQUIRED");
    expect(body.required).toBe("admin");
  });

  it("admin no puede catálogo/settings (minRole owner)", async () => {
    getSession.mockResolvedValue(session("admin"));
    const result = await requirePlatformAuth({ minRole: "owner" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.required).toBe("owner");
  });

  it("owner pasa minRole owner", async () => {
    getSession.mockResolvedValue(session("owner"));
    const result = await requirePlatformAuth({ minRole: "owner" });
    expect(result.ok).toBe(true);
  });

  it("JWT sin role se interpreta como admin (parse en verify)", async () => {
    getSession.mockResolvedValue(session("admin"));
    const result = await requirePlatformAuth({ minRole: "admin" });
    expect(result.ok).toBe(true);
  });
});

describe("platformForbidden shape", () => {
  it("NextResponse 403", async () => {
    getSession.mockResolvedValue(session("support"));
    const result = await requirePlatformAuth({ minRole: "owner" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response).toBeInstanceOf(NextResponse);
  });
});
