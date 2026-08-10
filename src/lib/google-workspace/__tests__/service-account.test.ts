import { afterEach, describe, expect, it, vi } from "vitest";

describe("getServiceAccountDriveClient", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("degrada a null si faltan env vars", async () => {
    vi.stubEnv("GOOGLE_DRIVE_SA_CLIENT_EMAIL", "");
    vi.stubEnv("GOOGLE_DRIVE_SA_PRIVATE_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getServiceAccountDriveClient, __resetServiceAccountClientForTests } =
      await import("../service-account");
    __resetServiceAccountClientForTests();
    expect(getServiceAccountDriveClient()).toBeNull();
    const joined = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(joined).toMatch(/Drive SA desactivado/);
    expect(joined).not.toMatch(/BEGIN PRIVATE KEY/);
    warn.mockRestore();
  });

  it("degrada a null con PEM inválido (sin BEGIN)", async () => {
    vi.stubEnv("GOOGLE_DRIVE_SA_CLIENT_EMAIL", "opai-drive@opai-workspace-prod.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_DRIVE_SA_PRIVATE_KEY", "not-a-pem");
    const { getServiceAccountDriveClient, __resetServiceAccountClientForTests } =
      await import("../service-account");
    __resetServiceAccountClientForTests();
    expect(getServiceAccountDriveClient()).toBeNull();
  });
});
