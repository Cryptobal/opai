"use client";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/**
 * Renderiza el valor de una celda en la matriz de proyección. Tres modos:
 *  - Sin actual: solo el proyectado.
 *  - Con actual y varianza ≠ 0: proyectado tachado + actual bold + Δ coloreado.
 *  - Con actual y varianza = 0: proyectado normal (no agrega visual ruido).
 *
 * Color de la varianza:
 *  - EXPENSE: positiva (sobregasto) = warn (amber); negativa (ahorro) = ok (verde).
 *  - INCOME: positiva (extra) = ok; negativa (faltante) = warn.
 */
export function CellAmount({
  projected,
  actual,
  variance,
  kind,
}: {
  projected: number;
  actual: number | null;
  variance: number | null;
  kind: "INCOME" | "EXPENSE";
}) {
  if (actual === null || variance === null) {
    return <span className="font-mono text-[12px]">{projected > 0 ? fmt.format(projected) : "—"}</span>;
  }
  if (variance === 0) {
    return <span className="font-mono text-[12px]">{fmt.format(actual)}</span>;
  }
  const isAdverse = kind === "EXPENSE" ? variance > 0 : variance < 0;
  const tone = isAdverse ? "text-status-warn-fg" : "text-status-ok-fg";
  return (
    <div className="leading-tight">
      <div className="font-mono text-[12px] line-through opacity-50">
        {fmt.format(projected)}
      </div>
      <div className="font-mono text-[12px] font-semibold">
        {fmt.format(actual)}
      </div>
      <div className={`font-mono text-[12px] ${tone}`}>
        {variance > 0 ? "+" : ""}
        {fmt.format(variance)}
      </div>
    </div>
  );
}
