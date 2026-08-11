import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildTreePreview,
  isModuleFolderEnabled,
  safeSegment,
  DrivePathsV2,
  docTypeDestinationLabel,
  inferEntityHintFromPathKey,
  resolveEntityFromFolderId,
} from "../drive-tree";
import {
  DEFAULT_MIRROR_CONFIG,
  SUPPORTED_DOC_TYPES,
} from "../drive-mirror-config";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    driveFolderCache: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("safeSegment", () => {
  it("reemplaza / y \\ y corta a 80", () => {
    expect(safeSegment("A/B\\C", "x")).toBe("A-B-C");
    const long = "a".repeat(100);
    expect(safeSegment(long, "x")).toHaveLength(80);
  });

  it("colapsa espacios y usa fallback si vacío", () => {
    expect(safeSegment("  foo   bar  ", "x")).toBe("foo bar");
    expect(safeSegment("   ", "fallback")).toBe("fallback");
    expect(safeSegment(null, "id-1")).toBe("id-1");
    expect(safeSegment('Cuenta "X"', "x")).toBe('Cuenta "X"');
  });
});

describe("DrivePathsV2", () => {
  it("arma rutas por entidad/docType", () => {
    expect(DrivePathsV2.deal("2026", "Acme")).toBe("Comercial/Negocios/2026/Acme");
    expect(DrivePathsV2.licitacion("2026", "Lic")).toBe("Comercial/Licitaciones/2026/Lic");
    expect(DrivePathsV2.contact("Cuenta", "Ana")).toBe(
      "Comercial/Cuentas/Cuenta/Contactos/Ana",
    );
    expect(DrivePathsV2.trabajador("12.345.678-9 — Pérez Juan")).toBe(
      "Personas/12.345.678-9 — Pérez Juan",
    );
    expect(DrivePathsV2.opsGeneral()).toBe("Operaciones/Documentos generales");
  });
});

describe("docTypeDestinationLabel", () => {
  it("cubre todos los tipos soportados con rutas del árbol v2", () => {
    for (const dt of SUPPORTED_DOC_TYPES) {
      const label = docTypeDestinationLabel(dt);
      expect(label.length).toBeGreaterThan(3);
      expect(label).not.toBe(dt);
    }
    expect(docTypeDestinationLabel("trabajadores")).toBe(
      "Personas / {RUT} — {Apellido Nombre}",
    );
    expect(docTypeDestinationLabel("licitacion")).toContain("Licitaciones");
    expect(docTypeDestinationLabel("cotizacion")).toContain("Cotizaciones");
  });
});

describe("isModuleFolderEnabled / buildTreePreview", () => {
  it("gatea por módulo tenant y docType activo", () => {
    const cfg = { ...DEFAULT_MIRROR_CONFIG, trabajadores: true, ops_documentos: false };
    expect(isModuleFolderEnabled("comercial", cfg, ["crm"])).toBe(true);
    expect(isModuleFolderEnabled("personas", cfg, ["personas"])).toBe(true);
    expect(isModuleFolderEnabled("personas", cfg, ["crm"])).toBe(false);
    expect(isModuleFolderEnabled("operaciones", cfg, ["documentos"])).toBe(false);
  });

  it("preview incluye solo módulos habilitados", () => {
    const cfg = {
      ...DEFAULT_MIRROR_CONFIG,
      leads: true,
      trabajadores: true,
      ops_documentos: true,
    };
    const lines = buildTreePreview(cfg, ["crm", "personas", "documentos"]);
    expect(lines[0]).toBe("Opai/");
    expect(lines.some((l) => l.includes("Comercial/"))).toBe(true);
    expect(lines.some((l) => l.includes("Leads/"))).toBe(true);
    expect(lines.some((l) => l.includes("Personas/"))).toBe(true);
    expect(lines.some((l) => l.includes("Operaciones/"))).toBe(true);
    expect(lines.some((l) => l.includes("Clientes/"))).toBe(false);
  });
});

describe("inferEntityHintFromPathKey", () => {
  it("reconoce hojas CRM v2", () => {
    expect(inferEntityHintFromPathKey("Comercial/Negocios/2026/Acme")).toEqual({
      entityType: "deal",
      leafName: "Acme",
      module: "comercial",
    });
    expect(
      inferEntityHintFromPathKey("Comercial/Cuentas/Foo/Contactos/Ana"),
    ).toMatchObject({ entityType: "contact", leafName: "Ana", accountName: "Foo" });
  });
});

describe("resolveEntityFromFolderId", () => {
  beforeEach(() => {
    vi.mocked(prisma.driveFolderCache.findFirst).mockReset();
  });

  it("devuelve entidad cuando el caché tiene entityType/entityId", async () => {
    vi.mocked(prisma.driveFolderCache.findFirst).mockResolvedValue({
      id: "c1",
      tenantId: "t1",
      pathKey: "Comercial/Negocios/2026/Acme",
      driveFolderId: "folder-1",
      entityType: "deal",
      entityId: "deal-1",
      lastVerifiedAt: null,
      createdAt: new Date(),
    } as never);
    const got = await resolveEntityFromFolderId("t1", "folder-1");
    expect(got).toEqual({
      entityType: "deal",
      entityId: "deal-1",
      pathKey: "Comercial/Negocios/2026/Acme",
      driveFolderId: "folder-1",
    });
  });

  it("devuelve null si la carpeta no está mapeada", async () => {
    vi.mocked(prisma.driveFolderCache.findFirst).mockResolvedValue(null);
    expect(await resolveEntityFromFolderId("t1", "unknown")).toBeNull();
  });
});
