/**
 * Tests del handshake criptográfico Web4Leads: derivación de key/secret,
 * round-trip de firma (firmar como Web4Leads, verificar como el endpoint),
 * ventana de timestamp y normalizadores. Funciones puras, sin DB.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  tenantWeb4leadsKey,
  tenantWeb4leadsSecret,
  verifyWeb4leadsSignature,
  isWeb4leadsTimestampValid,
  normalizeAccountNumber,
  normalizeBankCode,
} from "../web4leads-inbox";

const TENANT_A = "tenant_test_aaa";
const TENANT_B = "tenant_test_bbb";

function signLikeWeb4leads(secret: string, body: string, ts: string): string {
  return crypto.createHmac("sha256", secret).update(body + ts).digest("hex");
}

describe("web4leads-inbox", () => {
  const prevMaster = process.env.WEB4LEADS_MASTER_SECRET;

  beforeEach(() => {
    process.env.WEB4LEADS_MASTER_SECRET = "master-secret-de-prueba";
  });
  afterEach(() => {
    if (prevMaster === undefined) delete process.env.WEB4LEADS_MASTER_SECRET;
    else process.env.WEB4LEADS_MASTER_SECRET = prevMaster;
  });

  it("key: 12 hex chars, estable y distinta por tenant", () => {
    const k1 = tenantWeb4leadsKey(TENANT_A);
    expect(k1).toMatch(/^[0-9a-f]{12}$/);
    expect(tenantWeb4leadsKey(TENANT_A)).toBe(k1);
    expect(tenantWeb4leadsKey(TENANT_B)).not.toBe(k1);
  });

  it("secret: null sin master, 64 hex y distinto por tenant con master", () => {
    delete process.env.WEB4LEADS_MASTER_SECRET;
    expect(tenantWeb4leadsSecret(TENANT_A)).toBeNull();
    process.env.WEB4LEADS_MASTER_SECRET = "master-secret-de-prueba";
    const s1 = tenantWeb4leadsSecret(TENANT_A)!;
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
    expect(tenantWeb4leadsSecret(TENANT_B)).not.toBe(s1);
  });

  it("firma: round-trip OK (firma cliente ↔ verificación servidor)", () => {
    const secret = tenantWeb4leadsSecret(TENANT_A)!;
    const body = JSON.stringify({ accountNumber: "123", movements: [] });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signLikeWeb4leads(secret, body, ts);
    expect(verifyWeb4leadsSignature(body, ts, sig, secret)).toBe(true);
  });

  it("firma: falla con body alterado, timestamp alterado o secret ajeno", () => {
    const secret = tenantWeb4leadsSecret(TENANT_A)!;
    const otherSecret = tenantWeb4leadsSecret(TENANT_B)!;
    const body = JSON.stringify({ accountNumber: "123", movements: [] });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signLikeWeb4leads(secret, body, ts);
    expect(verifyWeb4leadsSignature(body + " ", ts, sig, secret)).toBe(false);
    expect(verifyWeb4leadsSignature(body, (parseInt(ts) + 1).toString(), sig, secret)).toBe(false);
    expect(verifyWeb4leadsSignature(body, ts, sig, otherSecret)).toBe(false);
    expect(verifyWeb4leadsSignature(body, ts, "no-es-hex", secret)).toBe(false);
    expect(verifyWeb4leadsSignature(body, ts, "", secret)).toBe(false);
  });

  it("timestamp: acepta dentro de ±300s, rechaza fuera y basura", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isWeb4leadsTimestampValid(String(now))).toBe(true);
    expect(isWeb4leadsTimestampValid(String(now - 299))).toBe(true);
    expect(isWeb4leadsTimestampValid(String(now + 299))).toBe(true);
    expect(isWeb4leadsTimestampValid(String(now - 301))).toBe(false);
    expect(isWeb4leadsTimestampValid(String(now + 301))).toBe(false);
    expect(isWeb4leadsTimestampValid("abc")).toBe(false);
    expect(isWeb4leadsTimestampValid("")).toBe(false);
  });

  it("normalizadores: cuenta a dígitos, banco uppercase sin prefijo", () => {
    expect(normalizeAccountNumber("0-000-12345678-9")).toBe("0000123456789");
    expect(normalizeAccountNumber("0.000.12345678.9")).toBe("0000123456789");
    expect(normalizeAccountNumber(" 000 0123456789 ")).toBe("0000123456789");
    expect(normalizeBankCode(" banco santander ")).toBe("SANTANDER");
    expect(normalizeBankCode("SANTANDER")).toBe("SANTANDER");
  });
});
