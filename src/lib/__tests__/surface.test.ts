import { describe, expect, it } from "vitest";
import { getDefaultPermissions, type RolePermissions } from "@/lib/permissions";
import {
  isProductividadPath,
  parseProductividadLandingCookie,
  parseSurface,
  PRODUCTIVIDAD_HOME_HREF,
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
  it("owner con todos los módulos → home de Productividad", () => {
    const landing = resolveProductividadLanding(
      getDefaultPermissions("owner"),
      allEnabled,
      { isAdmin: true },
    );
    expect(landing).toBe(PRODUCTIVIDAD_HOME_HREF);
  });

  it("sin módulo crm del tenant → home (Tareas sigue visible)", () => {
    const landing = resolveProductividadLanding(
      getDefaultPermissions("owner"),
      noCrm,
      { isAdmin: true },
    );
    expect(landing).toBe(PRODUCTIVIDAD_HOME_HREF);
  });

  it("solo agenda accesible → home", () => {
    const perms: RolePermissions = {
      modules: { ...getDefaultPermissions("viewer").modules, productividad: "view" },
      submodules: {
        "productividad.correos": "none",
        "productividad.tareas": "none",
        "productividad.agenda": "view",
      },
      capabilities: {},
    };
    expect(resolveProductividadLanding(perms, allEnabled)).toBe(PRODUCTIVIDAD_HOME_HREF);
  });

  it("sin ningún submódulo → null", () => {
    expect(
      resolveProductividadLanding(stripProductividad(getDefaultPermissions("owner")), allEnabled),
    ).toBeNull();
  });
});

describe("parseProductividadLandingCookie", () => {
  it("migra landings legacy y el home al home canónico", () => {
    expect(parseProductividadLandingCookie("/crm/correos")).toBe(PRODUCTIVIDAD_HOME_HREF);
    expect(parseProductividadLandingCookie("/opai/tareas")).toBe(PRODUCTIVIDAD_HOME_HREF);
    expect(parseProductividadLandingCookie("/opai/agenda")).toBe(PRODUCTIVIDAD_HOME_HREF);
    expect(parseProductividadLandingCookie(PRODUCTIVIDAD_HOME_HREF)).toBe(
      PRODUCTIVIDAD_HOME_HREF,
    );
  });

  it("rechaza valores ajenos", () => {
    expect(parseProductividadLandingCookie(undefined)).toBeNull();
    expect(parseProductividadLandingCookie("/hub")).toBeNull();
    expect(parseProductividadLandingCookie("/crm/leads")).toBeNull();
    expect(parseProductividadLandingCookie("https://evil.example")).toBeNull();
  });
});

describe("isProductividadPath", () => {
  it("reconoce las rutas del nodo productividad", () => {
    expect(isProductividadPath(PRODUCTIVIDAD_HOME_HREF)).toBe(true);
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
