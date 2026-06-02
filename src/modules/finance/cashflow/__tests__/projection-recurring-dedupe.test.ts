import { describe, it, expect } from "vitest";

/**
 * Réplica de la dedupe CONTRACT ↔ RECURRING_DTE en buildProjection.
 * Si cambia la lógica en projection.service.ts, actualizar acá.
 */
type Item = {
  source: string;
  crmAccountId: string | null;
  installationId: string | null;
  sourceRefId?: string | null;
};

function dedupeRecurringAgainstContract(items: Item[]): Item[] {
  const contractKeys = new Set<string>();
  for (const it of items) {
    if (
      it.crmAccountId &&
      (it.source === "CONTRACT" ||
        (it.source === "OTHER" && it.sourceRefId != null))
    ) {
      contractKeys.add(`${it.crmAccountId}|${it.installationId ?? ""}`);
    }
  }
  const recurringCountByKey = new Map<string, number>();
  for (const it of items) {
    if (it.source !== "RECURRING_DTE" || !it.crmAccountId) continue;
    const k = `${it.crmAccountId}|${it.installationId ?? ""}`;
    recurringCountByKey.set(k, (recurringCountByKey.get(k) ?? 0) + 1);
  }
  return items.filter((i) => {
    if (i.source !== "RECURRING_DTE") return true;
    if (!i.crmAccountId) return true;
    const k = `${i.crmAccountId}|${i.installationId ?? ""}`;
    if ((recurringCountByKey.get(k) ?? 0) >= 2) return true;
    return !contractKeys.has(k);
  });
}

describe("dedupe CONTRACT ↔ RECURRING_DTE", () => {
  const acc = "acc-trans";
  const inst = "inst-trans";

  it("colapsa 1-a-1 cuando hay CONTRACT + una sola RECURRING_DTE", () => {
    const items: Item[] = [
      { source: "CONTRACT", crmAccountId: acc, installationId: inst },
      { source: "RECURRING_DTE", crmAccountId: acc, installationId: inst },
    ];
    expect(dedupeRecurringAgainstContract(items)).toHaveLength(1);
    expect(dedupeRecurringAgainstContract(items)[0].source).toBe("CONTRACT");
  });

  it("NO colapsa cuando hay 2+ RECURRING_DTE en la misma instalación (Transmat)", () => {
    const items: Item[] = [
      { source: "CONTRACT", crmAccountId: acc, installationId: inst },
      {
        source: "RECURRING_DTE",
        crmAccountId: acc,
        installationId: inst,
        sourceRefId: "tpl-day-1",
      },
      {
        source: "RECURRING_DTE",
        crmAccountId: acc,
        installationId: inst,
        sourceRefId: "tpl-day-20",
      },
    ];
    const out = dedupeRecurringAgainstContract(items);
    expect(out).toHaveLength(3);
    expect(out.filter((i) => i.source === "RECURRING_DTE")).toHaveLength(2);
  });

  it("dedupe OTHER con sourceRefId igual que CONTRACT", () => {
    const items: Item[] = [
      { source: "OTHER", crmAccountId: acc, installationId: inst, sourceRefId: "doc-1" },
      { source: "RECURRING_DTE", crmAccountId: acc, installationId: inst },
    ];
    expect(dedupeRecurringAgainstContract(items)).toHaveLength(1);
  });
});
