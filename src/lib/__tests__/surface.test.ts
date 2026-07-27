import { describe, expect, it } from "vitest";
import { getDefaultPermissions, type RolePermissions } from "@/lib/permissions";
import {
  isProductividadPath,
  parseSurface,
  resolveProductividadLanding,
} from "@/lib/surface";

const allEnabled = () => true;
const noCrm = (key: string) => key !== "crm";

function stripProductividad(perms: RolePermissions): RolePermissions {
  return {
    ...perms,
    modules: { ...perms.modules, productividad: "none" },
    submodules: {
      ...perms.submodules,
      "productividad.correos": "none",
      "productividad.agenda": "none",
      "productividad.tareas": "none",
    },
  };
}

describe("parseSurface", () => {
  it("acepta valores válidos", () => {
    expect(parseSurface("erp")).toBe("erp");
    expect(parseSurface("productividad")).toBe("productividad");
  });

  it("cae a erp con valor inválido o vacío", () => {
    expect(parseSurface(undefined)).toBe("erp");
    expect(parseSurface(null)).toBe("erp");
    expect(parseSurface("")).toBe("erp");
    expect(parseSurface("admin")).toBe("erp");
    expect(parseSurface("ERP")).toBe("erp");
  });
});

describe("resolveProductividadLanding", () => {
  it("owner con todos los módulos → Correos", () => {
    const landing = resolveProductividadLanding(
      getDefaultPermissions("owner"),
      allEnabled,
      { isAdmin: true },
    );
    expect(landing).toBe("/crm/correos");
  });

  it("sin módulo crm del tenant → cae a Tareas", () => {
    const landing = resolveProductividadLanding(
      getDefaultPermissions("owner"),
      noCrm,
      { isAdmin: true },
    );
    expect(landing).toBe("/opai/tareas");
  });

  it("solo agenda accesible → Agenda", () => {
    const perms: RolePermissions = {
      modules: { ...getDefaultPermissions("viewer").modules, productividad: "view" },
      submodules: {
        "productividad.correos": "none",
        "productividad.tareas": "none",
        "productividad.agenda": "view",
      },
      capabilities: {},
    };
    expect(resolveProductividadLanding(perms, allEnabled)).toBe("/opai/agenda");
  });

  it("sin ningún submódulo → null", () => {
    expect(
      resolveProductividadLanding(stripProductividad(getDefaultPermissions("owner")), allEnabled),
    ).toBeNull();
  });
});

describe("isProductividadPath", () => {
  it("reconoce las rutas del nodo productividad", () => {
    expect(isProductividadPath("/crm/correos")).toBe(true);
    expect(isProductividadPath("/crm/correos/inbox")).toBe(true);
    expect(isProductividadPath("/opai/tareas")).toBe(true);
    expect(isProductividadPath("/opai/agenda")).toBe(true);
    expect(isProductividadPath("/ops/tickets")).toBe(true);
    expect(isProductividadPath("/opai/auditoria-productividad")).toBe(true);
  });

  it("rechaza rutas ajenas al portal", () => {
    expect(isProductividadPath("/hub")).toBe(false);
    expect(isProductividadPath("/crm/leads")).toBe(false);
    expect(isProductividadPath("/crm/leads/123")).toBe(false);
    expect(isProductividadPath("/ops/puestos")).toBe(false);
    expect(isProductividadPath("/finanzas")).toBe(false);
  });
});
