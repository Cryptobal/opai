/**
 * Líquido en vivo: dado un sueldo bruto, llama (debounce 320ms) al endpoint
 * compartido employer-cost-preview y devuelve líquido + costo empresa por
 * guardia. Best-effort: ante cualquier error (incl. 403 cross-módulo) queda en
 * null y el caller cae al valor persistido.
 */
"use client";

import { useEffect, useState } from "react";

export interface LiquidoPreview {
  net: number;
  employerPerGuard: number;
}

export function useLiquidoPreview(
  bruto: number,
  opts?: { disabled?: boolean; ufValue?: number | null }
): LiquidoPreview | null {
  const disabled = opts?.disabled ?? false;
  const ufValue = opts?.ufValue ?? null;
  const [data, setData] = useState<LiquidoPreview | null>(null);

  useEffect(() => {
    if (disabled || !bruto || bruto <= 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/crm/leads/employer-cost-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions: [{ baseSalary: bruto }], ufValue }),
        });
        const d = await res.json();
        const item = d?.success ? d.data?.items?.[0] : null;
        if (!cancelled && item) {
          setData({
            net: Number(item.netSalary) || 0,
            employerPerGuard: Number(item.employerCostPerGuard) || 0,
          });
        }
      } catch {
        /* silencioso: el caller usa el valor persistido */
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [bruto, disabled, ufValue]);

  return data;
}
