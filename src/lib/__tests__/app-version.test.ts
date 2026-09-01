import { describe, expect, it } from "vitest";
import { getAppVersion, PROVIDER_DISPLAY_NAME } from "@/lib/app-version";

describe("app-version", () => {
  it("expone el nombre del prestador", () => {
    expect(PROVIDER_DISPLAY_NAME).toBe("Opai SpA — OPAI");
  });

  it("devuelve una versión no vacía", () => {
    expect(getAppVersion().length).toBeGreaterThan(0);
  });
});
