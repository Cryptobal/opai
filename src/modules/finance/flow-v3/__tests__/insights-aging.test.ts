import { describe, it, expect } from "vitest";
import { buildAging } from "../insights-aging";
import { addDaysYmd, DEFAULT_COLLECTION_LAG_DAYS } from "../types";

describe("buildAging", () => {
  const TODAY = "2026-08-10";

  it("DTE con dueDate explícito", () => {
    const result = buildAging(
      [
        {
          issueYmd: "2026-07-01",
          dueYmd: "2026-07-20",
          pendingClp: 100_000,
          ceded: false,
        },
      ],
      TODAY,
    );
    // emitido hace 40 días → d30plus por emisión
    expect(result.byIssue.d30plus).toBe(100_000);
    // vencido hace 21 días → d16_30 por vencimiento
    expect(result.byDue.d16_30).toBe(100_000);
    expect(result.overdueClp).toBe(100_000);
    expect(result.count).toBe(1);
  });

  it("DTE sin dueDate usa emisión + collectionLagDays", () => {
    const issue = "2026-07-20";
    const due = addDaysYmd(issue, DEFAULT_COLLECTION_LAG_DAYS); // 2026-08-19
    const result = buildAging(
      [{ issueYmd: issue, dueYmd: due, pendingClp: 50_000, ceded: false }],
      TODAY,
    );
    // emitido hace 21 días
    expect(result.byIssue.d16_30).toBe(50_000);
    // vencimiento futuro → vigente (alDia)
    expect(result.byDue.alDia).toBe(50_000);
    expect(result.overdueClp).toBe(0);
  });

  it("emitido hace 20 días con término 30 → byIssue.d16_30 y byDue vigente", () => {
    const issue = "2026-07-21"; // 20 días antes de 2026-08-10
    const due = addDaysYmd(issue, 30);
    const result = buildAging(
      [{ issueYmd: issue, dueYmd: due, pendingClp: 200_000, ceded: false }],
      TODAY,
    );
    expect(result.byIssue.d16_30).toBe(200_000);
    expect(result.byDue.alDia).toBe(200_000);
    expect(result.byDue.d16_30).toBe(0);
  });

  it("cedida excluida de ambos buckets y del total", () => {
    const result = buildAging(
      [
        {
          issueYmd: "2026-01-01",
          dueYmd: "2026-02-01",
          pendingClp: 999_000,
          ceded: true,
        },
        {
          issueYmd: "2026-08-01",
          dueYmd: "2026-09-01",
          pendingClp: 10_000,
          ceded: false,
        },
      ],
      TODAY,
    );
    expect(result.totalClp).toBe(10_000);
    expect(result.count).toBe(1);
    expect(result.byIssue.alDia + result.byIssue.d1_15).toBe(10_000);
  });
});
