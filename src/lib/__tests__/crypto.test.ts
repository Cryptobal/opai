/**
 * Tests de src/lib/crypto.ts — fail-closed del secreto de tokens Gmail.
 *
 * Cubre:
 *  - getGmailTokenSecret lanza sin GMAIL_TOKEN_SECRET (undefined/vacío/espacios).
 *  - El mensaje de error no filtra valores de entorno.
 *  - Con la env seteada retorna el valor crudo (sin trim, por compatibilidad
 *    con tokens ya cifrados).
 *  - Round-trip encryptText/decryptText.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { decryptText, encryptText, getGmailTokenSecret } from "@/lib/crypto";

const ORIGINAL_SECRET = process.env.GMAIL_TOKEN_SECRET;

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.GMAIL_TOKEN_SECRET;
  } else {
    process.env.GMAIL_TOKEN_SECRET = ORIGINAL_SECRET;
  }
});

describe("getGmailTokenSecret", () => {
  beforeEach(() => {
    delete process.env.GMAIL_TOKEN_SECRET;
  });

  it("lanza si GMAIL_TOKEN_SECRET no está definido", () => {
    expect(() => getGmailTokenSecret()).toThrow(/GMAIL_TOKEN_SECRET/);
  });

  it("lanza si GMAIL_TOKEN_SECRET está vacío", () => {
    process.env.GMAIL_TOKEN_SECRET = "";
    expect(() => getGmailTokenSecret()).toThrow(/GMAIL_TOKEN_SECRET/);
  });

  it("lanza si GMAIL_TOKEN_SECRET es solo espacios", () => {
    process.env.GMAIL_TOKEN_SECRET = "   ";
    expect(() => getGmailTokenSecret()).toThrow(/GMAIL_TOKEN_SECRET/);
  });

  it("no imprime valores de entorno en el mensaje de error", () => {
    process.env.SOME_OTHER_SECRET = "super-secreto-vecino";
    let message = "";
    try {
      getGmailTokenSecret();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("super-secreto-vecino");
    expect(message).toMatch(/GMAIL_TOKEN_SECRET/);
    delete process.env.SOME_OTHER_SECRET;
  });

  it("retorna el secreto cuando está definido", () => {
    process.env.GMAIL_TOKEN_SECRET = "mi-secreto";
    expect(getGmailTokenSecret()).toBe("mi-secreto");
  });

  it("retorna el valor crudo (sin trim): los tokens persistidos se cifraron con el valor exacto", () => {
    process.env.GMAIL_TOKEN_SECRET = "  mi-secreto\n";
    expect(getGmailTokenSecret()).toBe("  mi-secreto\n");
  });
});

describe("encryptText/decryptText", () => {
  it("round-trip con el secreto correcto", () => {
    const payload = encryptText("token-123", "secreto-a");
    expect(decryptText(payload, "secreto-a")).toBe("token-123");
  });

  it("falla con un secreto distinto (AES-GCM auth tag)", () => {
    const payload = encryptText("token-123", "secreto-a");
    expect(() => decryptText(payload, "secreto-b")).toThrow();
  });
});
