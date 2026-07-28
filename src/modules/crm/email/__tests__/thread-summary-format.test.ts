import { describe, expect, it } from "vitest";
import { formatThreadSummary } from "../thread-summary-format";

describe("formatThreadSummary", () => {
  it("normaliza markdown con # y ** a viñetas sin literales", () => {
    const raw = `# Resumen
- De qué se trata: **licitación** de vigilancia
* Estado: cliente espera propuesta
1. Próximo paso: enviar cotización`;
    const lines = formatThreadSummary(raw);
    expect(lines).toEqual([
      { text: "De qué se trata: licitación de vigilancia", emphasis: true },
      { text: "Estado: cliente espera propuesta", emphasis: false },
      { text: "Próximo paso: enviar cotización", emphasis: false },
    ]);
    expect(lines.every((l) => !l.text.includes("#") && !l.text.includes("**"))).toBe(true);
  });

  it("acepta texto plano sin markdown", () => {
    expect(formatThreadSummary("Hilo corto sobre cobertura.")).toEqual([
      { text: "Hilo corto sobre cobertura.", emphasis: false },
    ]);
  });

  it("devuelve vacío ante cadena vacía", () => {
    expect(formatThreadSummary("")).toEqual([]);
  });

  it("devuelve vacío ante líneas solo con espacios", () => {
    expect(formatThreadSummary("   \n\t\n  ")).toEqual([]);
  });

  it("degrada a una línea plana si no hay estructura útil", () => {
    expect(formatThreadSummary("## \n###\nsolo esto")).toEqual([
      { text: "solo esto", emphasis: false },
    ]);
  });
});
