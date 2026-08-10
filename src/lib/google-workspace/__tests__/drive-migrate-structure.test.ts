import { describe, expect, it } from "vitest";
import { mapPathKeyV1toV2, mapTargetPathV1toV2 } from "../drive-path-map";

describe("mapPathKeyV1toV2", () => {
  it("mapea raíces y rutas de entidad", () => {
    expect(mapPathKeyV1toV2("Clientes")).toBe("Comercial/Cuentas");
    expect(mapPathKeyV1toV2("Clientes/Acme/General/Documentos")).toBe(
      "Comercial/Cuentas/Acme/General/Documentos",
    );
    expect(mapPathKeyV1toV2("Clientes/Acme/Personas/Ana")).toBe(
      "Comercial/Cuentas/Acme/Contactos/Ana",
    );
    expect(mapPathKeyV1toV2("Negocios/2026/Deal")).toBe("Comercial/Negocios/2026/Deal");
    expect(mapPathKeyV1toV2("Licitaciones/2026/Lic")).toBe(
      "Comercial/Licitaciones/2026/Lic",
    );
  });

  it("es idempotente sobre paths v2", () => {
    const v2 = "Comercial/Cuentas/Acme/Contactos/Ana";
    expect(mapPathKeyV1toV2(v2)).toBe(v2);
    expect(mapPathKeyV1toV2(mapPathKeyV1toV2("Clientes/X"))).toBe("Comercial/Cuentas/X");
  });

  it("mapTargetPath coincide con pathKey", () => {
    expect(mapTargetPathV1toV2("Negocios/2026/Y")).toBe("Comercial/Negocios/2026/Y");
  });
});
