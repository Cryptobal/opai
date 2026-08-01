import { describe, expect, it } from "vitest";
import { CONTACT_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-contacts";
import { INSTALLATION_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-installations";
import { QUOTE_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-quotes";
import {
  DEAL_LIST_DEFAULT_PAGE_SIZE,
  DEAL_LIST_KANBAN_PAGE_SIZE,
} from "@/lib/crm/list-deals";
import { ACCOUNT_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-accounts";

describe("CRM list page sizes", () => {
  it("usa 50 como page size estándar en listados", () => {
    expect(ACCOUNT_LIST_DEFAULT_PAGE_SIZE).toBe(50);
    expect(CONTACT_LIST_DEFAULT_PAGE_SIZE).toBe(50);
    expect(INSTALLATION_LIST_DEFAULT_PAGE_SIZE).toBe(50);
    expect(QUOTE_LIST_DEFAULT_PAGE_SIZE).toBe(50);
    expect(DEAL_LIST_DEFAULT_PAGE_SIZE).toBe(50);
  });

  it("kanban de negocios carga un page size mayor que la lista", () => {
    expect(DEAL_LIST_KANBAN_PAGE_SIZE).toBeGreaterThan(DEAL_LIST_DEFAULT_PAGE_SIZE);
    expect(DEAL_LIST_KANBAN_PAGE_SIZE).toBeLessThanOrEqual(500);
  });
});
