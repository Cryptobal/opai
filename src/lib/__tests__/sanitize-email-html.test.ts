/**
 * Tests de sanitize-email-html — bloqueo de imágenes remotas (V4) y sanitización.
 *
 * Cubre:
 *  - Imagen http(s)/protocol-relative → placeholder + data-blocked-src.
 *  - cid: y data: no se tocan.
 *  - blockRemoteImages:false proxifica http(s) por /api/crm/correos/remote-image.
 *  - data-blocked-src inyectado por el remitente se elimina (ALLOW_DATA_ATTR=false).
 *  - XSS: scripts y handlers siguen fuera.
 */
import { describe, it, expect } from "vitest";
import {
  BLOCKED_IMG_PLACEHOLDER,
  hasBlockedImages,
  sanitizeEmailHtml,
} from "@/lib/sanitize-email-html";

describe("sanitizeEmailHtml — bloqueo de imágenes remotas", () => {
  it("reescribe src remoto https a placeholder guardando el original", () => {
    const out = sanitizeEmailHtml(
      '<img src="https://tracker.example.com/pixel.png" alt="x">',
      { blockRemoteImages: true },
    );
    expect(out).toContain(`src="${BLOCKED_IMG_PLACEHOLDER}"`);
    expect(out).toContain('data-blocked-src="https://tracker.example.com/pixel.png"');
    expect(hasBlockedImages(out)).toBe(true);
  });

  it("bloquea también http y protocol-relative", () => {
    const http = sanitizeEmailHtml('<img src="http://a.cl/i.png">', {
      blockRemoteImages: true,
    });
    const protoRel = sanitizeEmailHtml('<img src="//a.cl/i.png">', {
      blockRemoteImages: true,
    });
    expect(http).toContain("data-blocked-src=");
    expect(protoRel).toContain("data-blocked-src=");
  });

  it("no toca imágenes inline cid: ni data:", () => {
    const cid = sanitizeEmailHtml('<img src="cid:firma123">', {
      blockRemoteImages: true,
    });
    expect(cid).toContain('src="cid:firma123"');
    expect(cid).not.toContain("data-blocked-src=");

    const data = sanitizeEmailHtml(`<img src="${BLOCKED_IMG_PLACEHOLDER}">`, {
      blockRemoteImages: true,
    });
    expect(data).not.toContain("data-blocked-src=");
  });

  it("con blockRemoteImages:false proxifica el src remoto (no lo deja crudo)", () => {
    const out = sanitizeEmailHtml('<img src="https://a.cl/logo.png">', {
      blockRemoteImages: false,
    });
    expect(out).toContain("/api/crm/correos/remote-image?u=");
    expect(out).toContain(encodeURIComponent("https://a.cl/logo.png"));
    expect(out).not.toContain('src="https://a.cl/logo.png"');
    expect(out).not.toContain("data-blocked-src=");
    expect(hasBlockedImages(out)).toBe(false);
  });

  it("bloquea por defecto (flag env no seteada)", () => {
    const out = sanitizeEmailHtml('<img src="https://a.cl/logo.png">');
    expect(out).toContain("data-blocked-src=");
  });

  it("elimina data-blocked-src inyectado por el remitente", () => {
    const out = sanitizeEmailHtml(
      '<img src="cid:x" data-blocked-src="https://evil.example.com/x.png">',
      { blockRemoteImages: true },
    );
    expect(out).not.toContain("evil.example.com");
  });

  it("varias imágenes: bloquea solo las remotas y conserva atributos", () => {
    const out = sanitizeEmailHtml(
      '<p>hola</p><img src="https://a.cl/1.png" width="10"><img src="cid:inline1">',
      { blockRemoteImages: true },
    );
    expect(out).toContain('data-blocked-src="https://a.cl/1.png"');
    expect(out).toContain('width="10"');
    expect(out).toContain('src="cid:inline1"');
  });
});

describe("sanitizeEmailHtml — sanitización base", () => {
  it("elimina scripts y handlers", () => {
    const out = sanitizeEmailHtml(
      '<script>alert(1)</script><img src="https://a.cl/x.png" onerror="alert(1)"><p>ok</p>',
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onerror");
    expect(out).toContain("<p>ok</p>");
  });

  it("fuerza noopener/target en links", () => {
    const out = sanitizeEmailHtml('<a href="https://a.cl">link</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});
