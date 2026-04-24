// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveRoundInstallationName } from "../monitor-turno-report-data";

describe("resolveRoundInstallationName", () => {
  it("uses the execution installation name for ad-hoc rounds without a template", () => {
    const name = resolveRoundInstallationName({
      installation: { name: "Polpaico el bosque" },
      rondaTemplate: null,
    });

    expect(name).toBe("Polpaico el bosque");
  });
});
