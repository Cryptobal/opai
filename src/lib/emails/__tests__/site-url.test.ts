import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getCanonicalSiteUrl,
  getTenantSiteUrl,
  buildEmailUrl,
  getNotificationPrefsUrl,
  getEmailLogoUrl,
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

  it("uses tenant subdomain when slug is provided", () => {
    expect(getTenantSiteUrl("gard")).toBe("https://gard.opai.cl");
  });

  it("rejects malicious slugs", () => {
    expect(getTenantSiteUrl("../evil")).toBe("https://www.opai.cl");
    expect(getTenantSiteUrl("evil.com/")).toBe("https://www.opai.cl");
  });

  it("buildEmailUrl prefixes relative paths with tenant subdomain", () => {
    expect(buildEmailUrl("/personas/guardias/x", "gard")).toBe(
      "https://gard.opai.cl/personas/guardias/x",
    );
  });

  it("buildEmailUrl preserves absolute URLs", () => {
    expect(buildEmailUrl("https://other.com/path", "gard")).toBe(
      "https://other.com/path",
    );
  });

  it("getEmailLogoUrl always points to canonical (subdomains don't serve /public)", () => {
    expect(getEmailLogoUrl()).toBe("https://www.opai.cl/logo-email.png");
  });

  it("getNotificationPrefsUrl encodes the type parameter", () => {
    const url = getNotificationPrefsUrl("gard", "guardia_doc_expired");
    expect(url).toBe(
      "https://gard.opai.cl/opai/perfil/notificaciones?type=guardia_doc_expired",
    );
  });
});
