/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signRelayToken, tokenAllowsStream, verifyRelayToken } from "../relay-token";

const SECRET = "test-media-relay-jwt-secret-32chars";

describe("relay-token", () => {
  const prev = process.env.MEDIA_RELAY_JWT_SECRET;

  beforeEach(() => {
    process.env.MEDIA_RELAY_JWT_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.MEDIA_RELAY_JWT_SECRET = prev;
  });

  it("firma y verifica claims tid/s/uid", async () => {
    const token = await signRelayToken({
      tenantId: "tenant-a",
      streams: ["cabc", "cdef"],
      userId: "user-1",
    });
    const claims = await verifyRelayToken(token);
    expect(claims).toEqual({
      tid: "tenant-a",
      s: ["cabc", "cdef"],
      uid: "user-1",
    });
  });

  it("rechaza token expirado", async () => {
    const token = await signRelayToken({
      tenantId: "tenant-a",
      streams: ["cabc"],
      userId: "user-1",
      expiresIn: "0s",
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(await verifyRelayToken(token)).toBeNull();
  });

  it("rechaza firma inválida", async () => {
    const token = await signRelayToken({
      tenantId: "tenant-a",
      streams: ["cabc"],
      userId: "user-1",
    });
    expect(await verifyRelayToken(token + "x")).toBeNull();
  });

  it("stream no autorizado no está en claims", async () => {
    const token = await signRelayToken({
      tenantId: "tenant-a",
      streams: ["allowed"],
      userId: "user-1",
    });
    const claims = await verifyRelayToken(token);
    expect(claims).not.toBeNull();
    expect(tokenAllowsStream(claims!, "allowed")).toBe(true);
    expect(tokenAllowsStream(claims!, "other")).toBe(false);
  });

  it("fail-closed sin MEDIA_RELAY_JWT_SECRET", async () => {
    delete process.env.MEDIA_RELAY_JWT_SECRET;
    await expect(
      signRelayToken({ tenantId: "t", streams: ["a"], userId: "u" }),
    ).rejects.toThrow(/MEDIA_RELAY_JWT_SECRET/);
  });
});
