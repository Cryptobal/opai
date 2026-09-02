/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { parseRelayVerifyRequest } from "../parse-verify";
import { serializeCamara } from "../serialize";
import { streamNameFor } from "../stream-name";
import { updateCamaraSchema } from "../schemas";
import { NextRequest } from "next/server";

describe("serializeCamara", () => {
  it("nunca incluye passwordEnc", () => {
    const out = serializeCamara({
      id: "1",
      username: "viewer",
      passwordEnc: "secret-cipher",
    });
    expect(out).toEqual({ id: "1", username: "viewer" });
    expect("passwordEnc" in out).toBe(false);
  });
});

describe("streamNameFor", () => {
  it("es determinista, opaco y sin caracteres especiales", () => {
    const a = streamNameFor("tenant-uuid", "camara-uuid");
    const b = streamNameFor("tenant-uuid", "camara-uuid");
    const other = streamNameFor("other-tenant", "camara-uuid");
    expect(a).toBe(b);
    expect(a).toMatch(/^c[a-f0-9]{20}$/);
    expect(a).not.toBe(other);
    expect(a).not.toContain("tenant");
  });
});

describe("updateCamaraSchema", () => {
  it("un patch solo con isActive no rellena defaults de create", () => {
    expect(updateCamaraSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

describe("parseRelayVerifyRequest", () => {
  it("lee token y src de X-Forwarded-Uri", () => {
    const req = new NextRequest("https://app.opai.cl/api/ops/camaras/relay/verify", {
      headers: {
        "x-forwarded-uri": "/api/ws?src=cabc123&token=jwt.here",
      },
    });
    expect(parseRelayVerifyRequest(req)).toEqual({
      token: "jwt.here",
      src: "cabc123",
    });
  });
});
