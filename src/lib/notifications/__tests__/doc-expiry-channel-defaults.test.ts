import { describe, it, expect } from "vitest";
import {
  applySlackTenantEmailDefault,
  isDocExpiryNotifType,
} from "../doc-expiry-channel-defaults";
import { expandCatalogDefaultsForType } from "../channel-types";

describe("doc-expiry-channel-defaults", () => {
  it("identifica tipos de vencimiento de documentos", () => {
    expect(isDocExpiryNotifType("guardia_doc_expired")).toBe(true);
    expect(isDocExpiryNotifType("docs_expiry_digest")).toBe(true);
    expect(isDocExpiryNotifType("new_lead")).toBe(false);
  });

  it("apaga email por default cuando el tenant tiene Slack", () => {
    const catalog = { bell: true, email: true, push: true };
    expect(applySlackTenantEmailDefault("guardia_doc_expired", catalog, true)).toEqual({
      bell: true,
      email: false,
      push: true,
    });
  });

  it("conserva defaults del catálogo sin Slack conectado", () => {
    const catalog = { bell: true, email: true, push: true };
    expect(applySlackTenantEmailDefault("guardia_doc_expired", catalog, false)).toEqual(catalog);
  });

  it("no altera tipos fuera de vencimientos aunque haya Slack", () => {
    const catalog = { bell: true, email: true, push: true };
    expect(applySlackTenantEmailDefault("new_lead", catalog, true)).toEqual(catalog);
  });

  it("expandCatalogDefaultsForType refleja email apagado en UI", () => {
    expect(
      expandCatalogDefaultsForType(
        "docs_expiry_digest",
        { bell: true, email: true, push: true },
        true,
      ),
    ).toEqual({
      bell: true,
      email: false,
      pushDesktop: true,
      pushMobile: true,
    });
  });
});
