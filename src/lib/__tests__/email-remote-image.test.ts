import { describe, expect, it } from "vitest";
import {
  EMAIL_REMOTE_IMAGE_PATH,
  absoluteHttpUrl,
  proxiedEmailImageSrc,
  rewriteCssUrls,
  rewriteEmailRemoteResources,
  rewriteSrcset,
} from "@/lib/email-remote-image";
import { ipIsPrivate, parseRemoteImageUrl } from "@/lib/email-remote-image-ssrf";

describe("email-remote-image", () => {
  it("normaliza protocol-relative a https", () => {
    expect(absoluteHttpUrl("//cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("arma la URL del proxy", () => {
    const src = proxiedEmailImageSrc("https://cdn.example.com/logo.png");
    expect(src.startsWith(`${EMAIL_REMOTE_IMAGE_PATH}?u=`)).toBe(true);
    expect(src).toContain(encodeURIComponent("https://cdn.example.com/logo.png"));
  });

  it("al mostrar, proxifica src y url() de fondos", () => {
    const html =
      '<img src="https://a.cl/l.png"><td style="background-image:url(https://a.cl/bg.png)" background="https://a.cl/bg.png">';
    const out = rewriteEmailRemoteResources(html, { blockRemoteImages: false });
    expect(out).toContain(EMAIL_REMOTE_IMAGE_PATH);
    expect(out).not.toContain('src="https://a.cl/l.png"');
    expect(out).not.toContain("url(https://a.cl/bg.png)");
  });

  it("al bloquear, quita url() remotas y marca background", () => {
    const html =
      '<td background="https://a.cl/bg.png" style="background-image:url(https://a.cl/bg.png)">';
    const out = rewriteEmailRemoteResources(html, { blockRemoteImages: true });
    expect(out).toContain("data-blocked-bg=");
    expect(out).toContain("none");
    expect(out).not.toContain("url(https://a.cl/bg.png)");
  });

  it("reescribe srcset", () => {
    const next = rewriteSrcset("https://a.cl/1.png 1x, https://a.cl/2.png 2x", false);
    expect(next).toContain(EMAIL_REMOTE_IMAGE_PATH);
    expect(rewriteSrcset("https://a.cl/1.png 1x", true)).toBe("");
  });

  it("rewriteCssUrls deja cid intacto", () => {
    expect(rewriteCssUrls("background-image:url(cid:x@y)", false)).toBe(
      "background-image:url(cid:x@y)",
    );
  });
});

describe("email-remote-image-ssrf", () => {
  it("rechaza localhost, metadata y RFC1918", () => {
    expect(parseRemoteImageUrl("http://localhost/x.png")).toBeNull();
    expect(parseRemoteImageUrl("http://127.0.0.1/x.png")).toBeNull();
    expect(parseRemoteImageUrl("http://169.254.169.254/latest")).toBeNull();
    expect(parseRemoteImageUrl("http://192.168.0.5/a.png")).toBeNull();
    expect(parseRemoteImageUrl("ftp://a.cl/a.png")).toBeNull();
  });

  it("acepta https público", () => {
    expect(parseRemoteImageUrl("https://cdn.senegocia.com/logo.png")?.hostname).toBe(
      "cdn.senegocia.com",
    );
  });

  it("ipIsPrivate cubre loopback y unique-local v6", () => {
    expect(ipIsPrivate("127.0.0.1")).toBe(true);
    expect(ipIsPrivate("10.0.0.1")).toBe(true);
    expect(ipIsPrivate("8.8.8.8")).toBe(false);
    expect(ipIsPrivate("::1")).toBe(true);
    expect(ipIsPrivate("2001:4860:4860::8888")).toBe(false);
  });
});
