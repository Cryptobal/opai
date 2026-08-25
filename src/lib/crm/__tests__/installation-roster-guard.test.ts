import { describe, expect, it } from "vitest";
import { formatRosterConflictError } from "@/lib/crm/installation-roster-guard";

describe("formatRosterConflictError", () => {
  it("nombra bloqueantes y marca licencia", () => {
    const msg = formatRosterConflictError([
      {
        installationId: "i1",
        guardiaId: "g1",
        name: "González Torres Xavier",
        lifecycleStatus: "contratado",
        onMedicalLeave: true,
      },
    ]);
    expect(msg).toContain("1 trabajador");
    expect(msg).toContain("González Torres Xavier (licencia médica)");
    expect(msg).toContain("Finiquita o desasigna");
  });

  it("sin roster no inventa bloqueo", () => {
    expect(formatRosterConflictError([])).toContain("0 trabajador");
  });

  it("resume nombres extra después de 5", () => {
    const blockers = Array.from({ length: 7 }, (_, i) => ({
      installationId: "i1",
      guardiaId: `g${i}`,
      name: `Guardia ${i + 1}`,
      lifecycleStatus: "contratado",
      onMedicalLeave: false,
    }));
    const msg = formatRosterConflictError(blockers);
    expect(msg).toContain("7 trabajador");
    expect(msg).toContain("y 2 más");
    expect(msg).toContain("Guardia 1");
    expect(msg).not.toContain("Guardia 6");
  });
});
