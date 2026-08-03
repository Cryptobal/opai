import { describe, expect, it } from "vitest";
import {
  includeFromSelectedIds,
  selectedIdsFromInclude,
} from "../usePlanDraft";

describe("includeFromSelectedIds / selectedIdsFromInclude", () => {
  it("round-trip conserva quote y omite account en include", () => {
    const ids = new Set(["account", "deal", "quote", "installations"]);
    const include = includeFromSelectedIds(ids);
    expect(include).toEqual({
      contact: false,
      deal: true,
      installations: true,
      attachments: false,
      followUpTask: false,
      quote: true,
      milestones: false,
    });
    expect([...selectedIdsFromInclude(include)].sort()).toEqual(
      [...ids].sort(),
    );
  });

  it("quote false si no está en la selección (bug histórico con coverage)", () => {
    const include = includeFromSelectedIds(
      new Set(["account", "contact", "deal", "installations", "attachments"]),
    );
    expect(include.quote).toBe(false);
  });
});
