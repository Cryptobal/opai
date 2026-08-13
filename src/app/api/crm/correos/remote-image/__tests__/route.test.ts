import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth-productividad", () => ({
  requireCorreosAccess: vi.fn(),
}));
vi.mock("@/lib/email-remote-image-ssrf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email-remote-image-ssrf")>(
    "@/lib/email-remote-image-ssrf",
  );
  return {
    ...actual,
    assertSafeRemoteImageHost: vi.fn().mockResolvedValue(true),
  };
});

import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { GET } from "../route";

describe("GET /api/crm/correos/remote-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCorreosAccess).mockResolvedValue({
      authorized: true,
      ctx: { tenantId: "t1", userId: "u1" },
    } as never);
  });

  it("exige URL", async () => {
    const req = new NextRequest("http://localhost/api/crm/correos/remote-image");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("rechaza localhost", async () => {
    const req = new NextRequest(
      "http://localhost/api/crm/correos/remote-image?u=" +
        encodeURIComponent("http://127.0.0.1/secret.png"),
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("sirve PNG con content-type de imagen", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(png, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      ),
    );
    const req = new NextRequest(
      "http://localhost/api/crm/correos/remote-image?u=" +
        encodeURIComponent("https://cdn.example.com/logo.png"),
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    vi.unstubAllGlobals();
  });

  it("rechaza SVG", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<svg></svg>", {
          status: 200,
          headers: { "Content-Type": "image/svg+xml" },
        }),
      ),
    );
    const req = new NextRequest(
      "http://localhost/api/crm/correos/remote-image?u=" +
        encodeURIComponent("https://cdn.example.com/x.svg"),
    );
    const res = await GET(req);
    expect(res.status).toBe(415);
    vi.unstubAllGlobals();
  });
});
