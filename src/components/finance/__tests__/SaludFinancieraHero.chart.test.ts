import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regresión: el gráfico anual (YTD / 12M) de Salud financiera se salía
 * del card cuando Recharts medía un ancho mayor al contenedor.
 */
describe("SaludFinancieraHero chart containment", () => {
  it("el cuadro de tendencia está recortado al card (overflow-hidden + width 100%)", () => {
    const src = readFileSync(
      resolve(__dirname, "../SaludFinancieraHero.tsx"),
      "utf8",
    );
    expect(src).toContain(
      'className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 min-w-0 overflow-hidden"',
    );
    expect(src).toContain(
      'className="h-[140px] w-full min-w-0 overflow-hidden"',
    );
    expect(src).toContain('<ResponsiveContainer width="100%" height="100%">');
  });
});
