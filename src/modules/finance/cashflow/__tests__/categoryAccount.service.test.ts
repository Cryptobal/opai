import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listMappingsForCategory,
  setMappingsForCategory,
  resolveCategoryFromAccount,
  bulkResolveCategoriesFromAccounts,
} from "../categoryAccount.service";

const TENANT = "test-tenant-cat-acc-svc";

async function pickFixture() {
  const cat = await prisma.financeCashflowCategory.findFirst({ where: { tenantId: TENANT } });
  const accs = await prisma.financeAccountPlan.findMany({ where: { tenantId: TENANT }, take: 3 });
  return { cat, accs };
}

describe("categoryAccount.service", () => {
  beforeEach(async () => {
    await prisma.financeCashflowCategoryAccount.deleteMany({ where: { tenantId: TENANT } });
  });

  afterAll(async () => {
    await prisma.financeCashflowCategoryAccount.deleteMany({ where: { tenantId: TENANT } });
  });

  it("setMappingsForCategory creates mappings with first as primary", async () => {
    const { cat, accs } = await pickFixture();
    if (!cat || accs.length < 2) {
      console.warn("Skipping: missing fixture data for tenant", TENANT);
      return;
    }
    await setMappingsForCategory(TENANT, cat.id, [accs[0].id, accs[1].id]);
    const mappings = await listMappingsForCategory(TENANT, cat.id);
    expect(mappings.length).toBe(2);
    const primary = mappings.find((m) => m.isPrimary);
    expect(primary?.accountPlanId).toBe(accs[0].id);
    const nonPrimary = mappings.find((m) => !m.isPrimary);
    expect(nonPrimary?.accountPlanId).toBe(accs[1].id);
  });

  it("setMappingsForCategory replaces existing mappings atomically", async () => {
    const { cat, accs } = await pickFixture();
    if (!cat || accs.length < 3) return;
    await setMappingsForCategory(TENANT, cat.id, [accs[0].id, accs[1].id]);
    await setMappingsForCategory(TENANT, cat.id, [accs[2].id]);
    const mappings = await listMappingsForCategory(TENANT, cat.id);
    expect(mappings.map((m) => m.accountPlanId)).toEqual([accs[2].id]);
    expect(mappings[0].isPrimary).toBe(true);
  });

  it("setMappingsForCategory with empty array clears all mappings", async () => {
    const { cat, accs } = await pickFixture();
    if (!cat || accs.length < 1) return;
    await setMappingsForCategory(TENANT, cat.id, [accs[0].id]);
    await setMappingsForCategory(TENANT, cat.id, []);
    const mappings = await listMappingsForCategory(TENANT, cat.id);
    expect(mappings).toEqual([]);
  });

  it("resolveCategoryFromAccount returns the category that has the account mapped", async () => {
    const { cat, accs } = await pickFixture();
    if (!cat || accs.length < 1) return;
    await setMappingsForCategory(TENANT, cat.id, [accs[0].id]);
    const found = await resolveCategoryFromAccount(TENANT, accs[0].id);
    expect(found?.id).toBe(cat.id);
  });

  it("resolveCategoryFromAccount returns null when no mapping", async () => {
    const found = await resolveCategoryFromAccount(TENANT, "00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });

  it("bulkResolveCategoriesFromAccounts returns Map for multiple accounts", async () => {
    const { cat, accs } = await pickFixture();
    if (!cat || accs.length < 2) return;
    await setMappingsForCategory(TENANT, cat.id, [accs[0].id, accs[1].id]);
    const map = await bulkResolveCategoriesFromAccounts(TENANT, [accs[0].id, accs[1].id]);
    expect(map.size).toBe(2);
    expect(map.get(accs[0].id)?.id).toBe(cat.id);
    expect(map.get(accs[1].id)?.id).toBe(cat.id);
  });

  it("bulkResolveCategoriesFromAccounts returns empty Map for empty input", async () => {
    const map = await bulkResolveCategoriesFromAccounts(TENANT, []);
    expect(map.size).toBe(0);
  });

  it("listMappingsForCategory orders primary first", async () => {
    const { cat, accs } = await pickFixture();
    if (!cat || accs.length < 3) return;
    await setMappingsForCategory(TENANT, cat.id, [accs[0].id, accs[1].id, accs[2].id]);
    const mappings = await listMappingsForCategory(TENANT, cat.id);
    expect(mappings[0].isPrimary).toBe(true);
    expect(mappings[0].accountPlanId).toBe(accs[0].id);
    expect(mappings.slice(1).every((m) => !m.isPrimary)).toBe(true);
  });
});
