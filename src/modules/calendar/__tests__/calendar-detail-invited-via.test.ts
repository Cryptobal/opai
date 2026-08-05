import { describe, expect, it } from "vitest";
import { resolveInvitedVia } from "../calendar-detail";

describe("resolveInvitedVia", () => {
  it("cuenta Google ACTIVE → google_account", () => {
    expect(
      resolveInvitedVia({
        hasGoogleAccount: true,
        adminEmail: "user@acme.cl",
        adminActive: true,
      }),
    ).toBe("google_account");
  });

  it("sin Google pero Admin.email activo → email", () => {
    expect(
      resolveInvitedVia({
        hasGoogleAccount: false,
        adminEmail: "user@acme.cl",
        adminActive: true,
      }),
    ).toBe("email");
  });

  it("sin Google ni email usable → none", () => {
    expect(
      resolveInvitedVia({
        hasGoogleAccount: false,
        adminEmail: null,
        adminActive: true,
      }),
    ).toBe("none");
    expect(
      resolveInvitedVia({
        hasGoogleAccount: false,
        adminEmail: "user@acme.cl",
        adminActive: false,
      }),
    ).toBe("none");
  });
});
