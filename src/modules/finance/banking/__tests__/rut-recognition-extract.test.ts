import { describe, expect, it } from "vitest";
import { extractCanonicalRutFromBankText } from "../rut-recognition.service";

describe("extractCanonicalRutFromBankText", () => {
  it("parses RUT sólo dígitos con cero inicial (cartola típica)", () => {
    expect(
      extractCanonicalRutFromBankText(
        "0799324601 Transf. SOCIEDAD DE INV",
      ),
    ).toBe("799324601");
  });

  it("acepta formato con puntos y guión", () => {
    expect(
      extractCanonicalRutFromBankText("Transf a 25.660.978-9 Franklys"),
    ).toBe("256609789");
  });

  it("acepta dígitos sin puntos pero con guión", () => {
    expect(extractCanonicalRutFromBankText("Pago 79932460-1 ok")).toBe(
      "799324601",
    );
  });

  it("no devuelve folio arbitrario cuando no está anclado como RUT en glosa", () => {
    expect(extractCanonicalRutFromBankText("fol 0269112182 ref")).toBeNull();
  });

  it("detecta dígitos denso después de texto si están pegados a Transf (sin ser prefijo)", () => {
    expect(
      extractCanonicalRutFromBankText(
        "Comprobante 0799324601 Transf. proveedor X",
      ),
    ).toBe("799324601");
  });
});
