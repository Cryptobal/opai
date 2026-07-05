import { describe, expect, it } from "vitest";
import {
  isInstallationOperationallyActive,
  onlyActiveInstallationProgramacion,
} from "../installation-operational-shutdown";

describe("installation-operational-shutdown", () => {
  it("isInstallationOperationallyActive solo acepta active", () => {
    expect(isInstallationOperationallyActive("active")).toBe(true);
    expect(isInstallationOperationallyActive("inactive")).toBe(false);
    expect(isInstallationOperationallyActive("prospect")).toBe(false);
  });

  it("onlyActiveInstallationProgramacion exige instalación active", () => {
    expect(onlyActiveInstallationProgramacion).toMatchObject({
      isActive: true,
      rondaTemplate: { installation: { status: "active" } },
    });
  });
});
