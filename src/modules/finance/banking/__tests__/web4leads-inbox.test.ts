import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  tenantWeb4leadsKey,
  tenantWeb4leadsSecret,
  web4leadsKeyMatchesTenant,
  verifyWeb4leadsSignature,
  isWeb4leadsTimestampValid,
  normalizeAccountNumber,
  normalizeBankCode,
} from "../web4leads-inbox";

describe("web4leads-inbox", () => {
  const tenantId = "tenant-abc-123";
  const master = "test-master-secret-hex";

  beforeEach(() => {
    process.env.WEB4LEADS_MASTER_SECRET = master;
  });

  afterEach(() => {
    delete process.env.WEB4LEADS_MASTER_SECRET;
  });

  it("tenantWeb4leadsKey es estable y 12 chars hex", () => {
    const key = tenantWeb4leadsKey(tenantId);
    expect(key).toHaveLength(12);
    expect(key).toMatch(/^[a-f0-9]{12}$/);
    expect(tenantWeb4leadsKey(tenantId)).toBe(key);
  });

  it("web4leadsKeyMatchesTenant", () => {
    const key = tenantWeb4leadsKey(tenantId);
    expect(web4leadsKeyMatchesTenant(key, tenantId)).toBe(true);
    expect(web4leadsKeyMatchesTenant("000000000000", tenantId)).toBe(false);
  });

  it("tenantWeb4leadsSecret deriva HMAC del master", () => {
    const secret = tenantWeb4leadsSecret(tenantId);
    expect(secret).toHaveLength(64);
    const expected = crypto
      .createHmac("sha256", master)
      .update(`web4leads:${tenantId}`)
      .digest("hex");
    expect(secret).toBe(expected);
  });

  it("tenantWeb4leadsSecret retorna null sin master", () => {
    delete process.env.WEB4LEADS_MASTER_SECRET;
    expect(tenantWeb4leadsSecret(tenantId)).toBeNull();
  });

  it("verifyWeb4leadsSignature acepta firma válida", () => {
    const secret = tenantWeb4leadsSecret(tenantId)!;
    const rawBody = '{"accountNumber":"123"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody + timestamp)
      .digest("hex");
    expect(
      verifyWeb4leadsSignature(rawBody, timestamp, signature, secret),
    ).toBe(true);
    expect(
      verifyWeb4leadsSignature(rawBody, timestamp, "deadbeef", secret),
    ).toBe(false);
  });

  it("isWeb4leadsTimestampValid respeta ventana", () => {
    const now = String(Math.floor(Date.now() / 1000));
    expect(isWeb4leadsTimestampValid(now)).toBe(true);
    expect(isWeb4leadsTimestampValid("not-a-number")).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 400);
    expect(isWeb4leadsTimestampValid(old)).toBe(false);
  });

  it("normalizeAccountNumber y normalizeBankCode", () => {
    expect(normalizeAccountNumber("0-000-12345678-9")).toBe("0000123456789");
    expect(normalizeBankCode("banco santander")).toBe("SANTANDER");
  });
});
