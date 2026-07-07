import { describe, it, expect } from "vitest";
import { getUnifiedType } from "../catalog";
import { canView, hasCapability, type RolePermissions } from "@/lib/permissions";

function isCashflowNotifRecipient(perms: RolePermissions, typeKey: string): boolean {
  const typeDef = getUnifiedType(typeKey);
  if (!typeDef || typeDef.module !== "finance") return false;
  const moduleOk = typeDef.submodule
    ? canView(perms, "finance", typeDef.submodule)
    : false;
  const capabilityOk = typeDef.capability ? hasCapability(perms, typeDef.capability) : true;
  return moduleOk && capabilityOk;
}

describe("cashflow slack permissions", () => {
  it("cashflow_drift_alert exige cashflow_view y no usa canal compartido", () => {
    const typeDef = getUnifiedType("cashflow_drift_alert");
    expect(typeDef).not.toBeNull();
    expect(typeDef?.capability).toBe("cashflow_view");
    expect(typeDef?.slackDmOnly).toBe(true);
  });

  it("editor con finance:view pero sin cashflow_view no recibe drift", () => {
    const editorPerms: RolePermissions = {
      modules: { finance: "view" },
      submodules: {},
      capabilities: {},
    };
    expect(isCashflowNotifRecipient(editorPerms, "cashflow_drift_alert")).toBe(false);
  });

  it("admin con cashflow_view sí recibe drift", () => {
    const financePerms: RolePermissions = {
      modules: { finance: "full" },
      submodules: {},
      capabilities: { cashflow_view: true },
    };
    expect(isCashflowNotifRecipient(financePerms, "cashflow_drift_alert")).toBe(true);
  });
});
