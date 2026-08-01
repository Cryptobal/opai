import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LIST_DEFAULT_PAGE_SIZE,
  buildAccountListWhere,
} from "@/lib/crm/list-accounts";

describe("buildAccountListWhere", () => {
  it("filtra por tenant siempre", () => {
    const where = buildAccountListWhere({ tenantId: "t1" });
    expect(where).toEqual({ tenantId: "t1" });
  });

  it("oculta prospectos cuando no hay permiso de leads", () => {
    const where = buildAccountListWhere({ tenantId: "t1", canSeeLeads: false });
    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        { tenantId: "t1" },
        { type: "client", isActive: true },
      ]),
    });
  });

  it("aplica lifecycle prospect con fallback legacy", () => {
    const where = buildAccountListWhere({
      tenantId: "t1",
      lifecycle: "prospect",
    });
    expect(JSON.stringify(where)).toContain("prospect");
  });

  it("busca por nombre, RUT, industria y razón social", () => {
    const where = buildAccountListWhere({
      tenantId: "t1",
      search: "  Acme  ",
    });
    const and = (where as { AND: unknown[] }).AND;
    const searchClause = and.find(
      (c) => c && typeof c === "object" && "OR" in (c as object),
    ) as { OR: Array<Record<string, unknown>> };
    expect(searchClause.OR).toHaveLength(4);
    expect(searchClause.OR[0]).toEqual({
      name: { contains: "Acme", mode: "insensitive" },
    });
  });

  it("combina lifecycle all sin añadir filtro de status", () => {
    const where = buildAccountListWhere({
      tenantId: "t1",
      lifecycle: "all",
      search: "x",
    });
    const serialized = JSON.stringify(where);
    expect(serialized).not.toContain("client_active");
    expect(serialized).toContain("x");
  });
});

describe("ACCOUNT_LIST_DEFAULT_PAGE_SIZE", () => {
  it("mantiene un tamaño de página usable", () => {
    expect(ACCOUNT_LIST_DEFAULT_PAGE_SIZE).toBe(50);
  });
});
