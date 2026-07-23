import { describe, expect, it } from "vitest";
import { columnLetter } from "../column-letter";

describe("columnLetter", () => {
  it("primeras letras A..Z", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(1)).toBe("B");
    expect(columnLetter(4)).toBe("E");
    expect(columnLetter(25)).toBe("Z");
  });

  it("después de Z sigue AA, AB, …", () => {
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(52)).toBe("BA");
    expect(columnLetter(77)).toBe("BZ");
  });

  it("cubre el horizonte de la planilla (~57 semanas ≤ 60 columnas)", () => {
    // Concepto = A; la semana i usa columnLetter(i + 1).
    expect(columnLetter(57)).toBe("BF");
    expect(columnLetter(60)).toBe("BI");
  });

  it("doble a triple letra", () => {
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
  });

  it("entrada inválida → cadena vacía", () => {
    expect(columnLetter(-1)).toBe("");
    expect(columnLetter(1.5)).toBe("");
    expect(columnLetter(Number.NaN)).toBe("");
  });
});
