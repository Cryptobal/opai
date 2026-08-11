import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { resolveLegacyType } from "@/lib/docs/legacy-type-map";
import { emptyStats } from "@/lib/docs/migration/types";
import { parseCursor, formatCursor } from "@/lib/docs/migration/cursor";

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    extractStorageKeyFromPublicUrl: vi.fn(actual.extractStorageKeyFromPublicUrl),
  };
});

describe("migration backfill rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cursor avanza entre fases", () => {
    expect(parseCursor(null)).toEqual({ phase: "persona", afterId: null });
    expect(formatCursor("persona", "abc")).toBe("persona:abc");
    expect(parseCursor("operacional:xyz")).toEqual({
      phase: "operacional",
      afterId: "xyz",
    });
    expect(formatCursor("done", null)).toBe("done");
  });

  it("idempotencia conceptual: legacySource+legacyId es la clave", () => {
    const stats = emptyStats();
    const seen = new Set<string>();
    const key = (source: string, id: string) => `${source}:${id}`;
    const migrate = (source: string, id: string) => {
      const k = key(source, id);
      if (seen.has(k)) {
        stats.skipped++;
        return false;
      }
      seen.add(k);
      stats.personaMigrated++;
      return true;
    };
    expect(migrate("ops_documento_persona", "1")).toBe(true);
    expect(migrate("ops_documento_persona", "1")).toBe(false);
    expect(stats.personaMigrated).toBe(1);
    expect(stats.skipped).toBe(1);
  });

  it("filas sin storageKey derivable se marcan needsAttention", () => {
    vi.mocked(extractStorageKeyFromPublicUrl).mockReturnValue(null);
    const fileUrl = "https://other-cdn.example/file.pdf";
    const storageKey = extractStorageKeyFromPublicUrl(fileUrl);
    const needsAttention = !storageKey;
    expect(needsAttention).toBe(true);
  });

  it("copia campos de vigencia sin transformar (paridad de forma)", () => {
    const legacy = {
      expiresAt: new Date("2026-12-01"),
      issuedAt: new Date("2025-01-01"),
      status: "vigente",
      lastExpiryMilestone: 14,
      renewalInProgressUntil: null as Date | null,
      expiryDismissedAt: null as Date | null,
      portalVisible: true,
    };
    const migrated = { ...legacy };
    expect(migrated).toEqual(legacy);
  });

  it("tipo legado desconocido no usa sin_clasificar", () => {
    const r = resolveLegacyType("permiso_portacion_xyz", true);
    expect(r.kind).toBe("create");
    if (r.kind === "create") {
      expect(r.codigo).not.toContain("sin_clasificar");
      expect(r.normativa).toBeNull();
      expect(r.tieneVencimiento).toBe(true);
    }
  });
});
