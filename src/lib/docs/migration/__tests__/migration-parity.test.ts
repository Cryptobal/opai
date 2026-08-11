import { describe, expect, it } from "vitest";
import { diffIdSets } from "@/lib/docs/migration/alert-ids";
import type { ParityReport } from "@/lib/docs/migration/types";

function decideStatus(report: ParityReport): "completed" | "failed" {
  return report.ok ? "completed" : "failed";
}

describe("migration parity", () => {
  it("con conjuntos idénticos marca completed", () => {
    const a = new Set(["1", "2", "3"]);
    const b = new Set(["3", "2", "1"]);
    const diff = diffIdSets(a, b);
    expect(diff.onlyLegacy).toEqual([]);
    expect(diff.onlyUnified).toEqual([]);
    const report: ParityReport = { ok: true, mismatches: [] };
    expect(decideStatus(report)).toBe("completed");
  });

  it("detecta diferencia inyectada y marca failed", () => {
    const legacy = new Set(["a", "b", "c"]);
    const unified = new Set(["a", "b"]); // falta c
    const diff = diffIdSets(legacy, unified);
    expect(diff.onlyLegacy).toEqual(["c"]);
    const report: ParityReport = {
      ok: false,
      mismatches: [
        {
          kind: "alert_ids",
          detail: "onlyLegacy=1 onlyUnified=0",
          sampleIds: diff.onlyLegacy,
        },
      ],
    };
    expect(decideStatus(report)).toBe("failed");
  });

  it("conteo distinto también falla", () => {
    const report: ParityReport = {
      ok: false,
      mismatches: [{ kind: "count_persona", detail: "legado=10 migrado=9" }],
    };
    expect(decideStatus(report)).toBe("failed");
  });
});
