import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDocumentCode,
  nextDocumentCode,
} from "../document-counter";

describe("formatDocumentCode", () => {
  it("formatea con padStart(3) y no trunca >999", () => {
    expect(formatDocumentCode("quote", 2026, 1)).toBe("CPQ-2026-001");
    expect(formatDocumentCode("bundle", 2026, 12)).toBe("PROP-2026-012");
    expect(formatDocumentCode("quote", 2026, 1000)).toBe("CPQ-2026-1000");
  });
});

describe("nextDocumentCode", () => {
  const counters = new Map<string, number>();

  function key(tenantId: string, kind: string, year: number) {
    return `${tenantId}:${kind}:${year}`;
  }

  const tx = {
    cpqDocumentCounter: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { tenantId_kind_year: { tenantId: string; kind: string; year: number } };
          create: { tenantId: string; kind: string; year: number; lastNumber: number };
          update: { lastNumber: { increment: number } };
        }) => {
          const { tenantId, kind, year } = where.tenantId_kind_year;
          const k = key(tenantId, kind, year);
          if (!counters.has(k)) {
            counters.set(k, create.lastNumber);
            return { tenantId, kind, year, lastNumber: create.lastNumber };
          }
          const next = (counters.get(k) ?? 0) + update.lastNumber.increment;
          counters.set(k, next);
          return { tenantId, kind, year, lastNumber: next };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { tenantId_kind_year: { tenantId: string; kind: string; year: number } };
          data: { lastNumber: { increment: number } };
        }) => {
          const { tenantId, kind, year } = where.tenantId_kind_year;
          const k = key(tenantId, kind, year);
          const next = (counters.get(k) ?? 0) + data.lastNumber.increment;
          counters.set(k, next);
          return { tenantId, kind, year, lastNumber: next };
        },
      ),
    },
  };

  beforeEach(() => {
    counters.clear();
    vi.clearAllMocks();
  });

  it("no retrocede tras borrar (el contador sigue incrementando)", async () => {
    const a = await nextDocumentCode(tx as never, "t1", "quote", 2026);
    const b = await nextDocumentCode(tx as never, "t1", "quote", 2026);
    // simula borrado de registros — el contador no mira count()
    counters.set(key("t1", "quote", 2026), 2);
    const c = await nextDocumentCode(tx as never, "t1", "quote", 2026);
    expect(a).toBe("CPQ-2026-001");
    expect(b).toBe("CPQ-2026-002");
    expect(c).toBe("CPQ-2026-003");
  });

  it("aísla por tenant: dos tenants generan CPQ-2026-001", async () => {
    const a = await nextDocumentCode(tx as never, "tenant-a", "quote", 2026);
    const b = await nextDocumentCode(tx as never, "tenant-b", "quote", 2026);
    expect(a).toBe("CPQ-2026-001");
    expect(b).toBe("CPQ-2026-001");
  });

  it("cambio de año reinicia a 001", async () => {
    await nextDocumentCode(tx as never, "t1", "quote", 2026);
    await nextDocumentCode(tx as never, "t1", "quote", 2026);
    const nextYear = await nextDocumentCode(tx as never, "t1", "quote", 2027);
    expect(nextYear).toBe("CPQ-2027-001");
  });

  it("genera PROP- para bundles", async () => {
    const code = await nextDocumentCode(tx as never, "t1", "bundle", 2026);
    expect(code).toBe("PROP-2026-001");
  });
});
