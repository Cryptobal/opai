import { describe, expect, it } from "vitest";
import { ART22_MARCACION_ERROR, rejectArticulo22Marcacion } from "../marcacion-art22";

describe("marcacion-art22", () => {
  it("rechaza si es Art. 22", () => {
    expect(rejectArticulo22Marcacion(true)).toBe(ART22_MARCACION_ERROR);
  });

  it("permite marcar si no es Art. 22", () => {
    expect(rejectArticulo22Marcacion(false)).toBeNull();
    expect(rejectArticulo22Marcacion(undefined)).toBeNull();
  });
});
