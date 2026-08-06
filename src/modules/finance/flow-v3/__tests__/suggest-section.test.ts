import { describe, expect, it } from "vitest";
import { suggestFlowSectionForCategory } from "../suggest-section";

describe("suggestFlowSectionForCategory", () => {
  it("mapea códigos canónicos de remuneraciones", () => {
    expect(suggestFlowSectionForCategory("EGR_SUELDO")).toBe("REMUNERACIONES");
    expect(suggestFlowSectionForCategory("EGR_FINIQUITO")).toBe("REMUNERACIONES");
  });

  it("mapea IVA / impuestos / TGR a IMPUESTOS", () => {
    expect(suggestFlowSectionForCategory("EGR_IVA_F29")).toBe("IMPUESTOS");
    expect(suggestFlowSectionForCategory("EGR_TGR", "T.G.R.")).toBe("IMPUESTOS");
    expect(suggestFlowSectionForCategory("EGR_OTRO", "TGR")).toBe("IMPUESTOS");
  });

  it("mapea factoring / socios a FINANCIAMIENTO", () => {
    expect(suggestFlowSectionForCategory("EGR_FACTORING")).toBe("FINANCIAMIENTO");
    expect(suggestFlowSectionForCategory("EGR_RETIRO_SOCIO")).toBe("FINANCIAMIENTO");
  });

  it("default GAV para egresos operativos genéricos", () => {
    expect(suggestFlowSectionForCategory("EGR_TELEFONIA")).toBe("GAV");
    expect(suggestFlowSectionForCategory("EGR_PROVEEDOR", "Proveedores")).toBe(
      "GAV",
    );
  });
});
