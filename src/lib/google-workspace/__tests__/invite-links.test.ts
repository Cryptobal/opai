import { describe, expect, it } from "vitest";
import {
  buildGoogleWorkspaceInviteLinks,
  GOOGLE_WORKSPACE_CONNECT_PATHS,
} from "../invite-links";
import { safeGmailReturnPath, GMAIL_DEFAULT_RETURN } from "../gmail-return-path";

describe("buildGoogleWorkspaceInviteLinks", () => {
  it("incluye paths de Gmail, Drive y Calendar", () => {
    const links = buildGoogleWorkspaceInviteLinks(null);
    expect(links.gmailUrl).toContain(GOOGLE_WORKSPACE_CONNECT_PATHS.gmail);
    expect(links.driveUrl).toContain(GOOGLE_WORKSPACE_CONNECT_PATHS.drive);
    expect(links.calendarUrl).toContain(GOOGLE_WORKSPACE_CONNECT_PATHS.calendar);
    expect(links.gmailUrl).toMatch(/^https?:\/\//);
  });
});

describe("safeGmailReturnPath", () => {
  it("acepta la página de configuración de Gmail", () => {
    expect(safeGmailReturnPath("/opai/configuracion/integraciones/gmail")).toBe(
      "/opai/configuracion/integraciones/gmail",
    );
  });

  it("rechaza open-redirects", () => {
    expect(safeGmailReturnPath("https://evil.example")).toBe(GMAIL_DEFAULT_RETURN);
    expect(safeGmailReturnPath("/crm/leads")).toBe(GMAIL_DEFAULT_RETURN);
    expect(safeGmailReturnPath(null)).toBe(GMAIL_DEFAULT_RETURN);
  });
});
