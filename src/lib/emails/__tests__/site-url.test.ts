import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getCanonicalSiteUrl,
  getTenantSiteUrl,
  buildEmailUrl,
  getNotificationPrefsUrl,
  getEmailLogoUrl,
  appendTenantQuery,
  getEmailBaseUrl,
} from "../site-url";

describe("site-url helpers", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("falls back to canonical www.opai.cl when no env is set", () => {
    expect(getCanonicalSiteUrl()).toBe("https://www.opai.cl");
  });

  it("never returns gard.cl even if env is misconfigured", () => {
    process.env.NEXTAUTH_URL = "https://opai.gard.cl";
    expect(getCanonicalSiteUrl()).toBe("https://www.opai.cl");
  });

  it("getTenantSiteUrl returns canonical (subdomain model retired)", () => {
    expect(getTenantSiteUrl("gard")).toBe("https://www.opai.cl");
    expect(getTenantSiteUrl(null)).toBe("https://www.opai.cl");
    expect(getTenantSiteUrl(undefined)).toBe("https://www.opai.cl");
  });

  it("getTenantSiteUrl ignores invalid slugs (returns canonical anyway)", () => {
    expect(getTenantSiteUrl("../evil")).toBe("https://www.opai.cl");
    expect(getTenantSiteUrl("evil.com/")).toBe("https://www.opai.cl");
  });

  it("buildEmailUrl uses canonical for authenticated admin routes (no tenant query)", () => {
    expect(buildEmailUrl("/personas/guardias/x", "gard")).toBe(
      "https://www.opai.cl/personas/guardias/x",
    );
    expect(buildEmailUrl("/ops/tickets/xyz", "gard")).toBe(
      "https://www.opai.cl/ops/tickets/xyz",
    );
    expect(buildEmailUrl("/opai/crm", "gard")).toBe(
      "https://www.opai.cl/opai/crm",
    );
  });

  it("buildEmailUrl appends tenant query for public portal routes", () => {
    expect(buildEmailUrl("/portal/cliente", "gard")).toBe(
      "https://www.opai.cl/portal/cliente?tenant=gard&t=gard",
    );
  });

  it("buildEmailUrl preserves existing query params when appending tenant", () => {
    expect(buildEmailUrl("/portal/cliente?email=a@b.cl", "gard")).toBe(
      "https://www.opai.cl/portal/cliente?email=a%40b.cl&tenant=gard&t=gard",
    );
  });

  it("buildEmailUrl does not overwrite existing tenant or t query", () => {
    expect(buildEmailUrl("/portal/cliente?tenant=otro", "gard")).toBe(
      "https://www.opai.cl/portal/cliente?tenant=otro",
    );
    expect(buildEmailUrl("/portal/cliente?t=otro", "gard")).toBe(
      "https://www.opai.cl/portal/cliente?t=otro",
    );
  });

  it("buildEmailUrl preserves absolute URLs", () => {
    expect(buildEmailUrl("https://other.com/path", "gard")).toBe(
      "https://other.com/path",
    );
  });

  it("buildEmailUrl handles other public path prefixes", () => {
    expect(buildEmailUrl("/sign/abc123", "gard")).toBe(
      "https://www.opai.cl/sign/abc123?tenant=gard&t=gard",
    );
    expect(buildEmailUrl("/registro-demo/abc", "gard")).toBe(
      "https://www.opai.cl/registro-demo/abc?tenant=gard&t=gard",
    );
    expect(buildEmailUrl("/p/abc", "gard")).toBe(
      "https://www.opai.cl/p/abc?tenant=gard&t=gard",
    );
  });

  it("appendTenantQuery is a no-op without a valid slug", () => {
    expect(
      appendTenantQuery("https://www.opai.cl/portal/cliente", undefined),
    ).toBe("https://www.opai.cl/portal/cliente");
    expect(
      appendTenantQuery("https://www.opai.cl/portal/cliente", "../evil"),
    ).toBe("https://www.opai.cl/portal/cliente");
  });

  it("getEmailLogoUrl always points to canonical (subdomains don't serve /public)", () => {
    expect(getEmailLogoUrl()).toBe("https://www.opai.cl/logo-email.png");
  });

  it("getNotificationPrefsUrl includes type and tenant on canonical", () => {
    const url = getNotificationPrefsUrl("gard", "guardia_doc_expired");
    expect(url).toBe(
      "https://www.opai.cl/opai/perfil/notificaciones?type=guardia_doc_expired&tenant=gard",
    );
  });

  it("getNotificationPrefsUrl works without args", () => {
    expect(getNotificationPrefsUrl()).toBe(
      "https://www.opai.cl/opai/perfil/notificaciones",
    );
  });

  it("getEmailBaseUrl honours a valid http(s) override", () => {
    expect(getEmailBaseUrl("https://preview.example.com/")).toBe(
      "https://preview.example.com",
    );
  });

  it("getEmailBaseUrl falls back to canonical for gard.cl override", () => {
    expect(getEmailBaseUrl("https://opai.gard.cl")).toBe("https://www.opai.cl");
  });
});
