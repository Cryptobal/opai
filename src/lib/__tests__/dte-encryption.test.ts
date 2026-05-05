import { describe, it, expect, beforeAll } from "vitest";
import {
  encryptString,
  decryptString,
  encryptBuffer,
  decryptBuffer,
} from "../dte-encryption";

describe("dte-encryption", () => {
  beforeAll(() => {
    // Set a known key for test repeatability
    process.env.DTE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("encrypts and decrypts strings correctly", () => {
    const plaintext = "MyP@ssw0rd!Cert.pfx";
    const encrypted = encryptString(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptString(encrypted)).toBe(plaintext);
  });

  it("encrypts and decrypts Buffers correctly", () => {
    const buf = Buffer.from("hello world binary data \x00\x01\x02", "binary");
    const encrypted = encryptBuffer(buf);
    expect(encrypted.equals(buf)).toBe(false);
    expect(decryptBuffer(encrypted).equals(buf)).toBe(true);
  });

  it("produces different ciphertext for same input (due to random IV)", () => {
    const a = encryptString("same");
    const b = encryptString("same");
    expect(a).not.toBe(b);
  });

  it("throws if DTE_ENCRYPTION_KEY is missing or invalid", () => {
    const orig = process.env.DTE_ENCRYPTION_KEY;
    process.env.DTE_ENCRYPTION_KEY = "tooshort";
    expect(() => encryptString("x")).toThrow();
    process.env.DTE_ENCRYPTION_KEY = orig;
  });
});
