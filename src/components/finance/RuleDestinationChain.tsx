"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type RuleDestinationLookup =
  | { accountPlanId: string; flowRowId?: never }
  | { flowRowId: string; accountPlanId?: never };

interface ChainData {
  account: { id: string; code: string; name: string; type: string } | null;
  category: { id: string; code: string; name: string; kind: string } | null;
  row: { id: string; name: string; section: string; mapping: string } | null;
  warnings: string[];
}

interface Props {
  lookup: RuleDestinationLookup | null;
  className?: string;
}

/**
 * Cadena cuenta ↔ categoría ↔ fila para editores de regla.
 * Consulta puntual `GET /api/finance/cashflow/flow-health?accountPlanId=`
 * o `?flowRowId=` (no recarga el reporte completo).
 */
export function RuleDestinationChain({ lookup, className }: Props) {
  const [data, setData] = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountPlanId =
    lookup && "accountPlanId" in lookup ? lookup.accountPlanId : undefined;
  const flowRowId =
    lookup && "flowRowId" in lookup ? lookup.flowRowId : undefined;

  useEffect(() => {
    if (!accountPlanId && !flowRowId) {
      setData(null);
      setForbidden(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setForbidden(false);
    setError(null);
    const qs = accountPlanId
      ? `accountPlanId=${encodeURIComponent(accountPlanId)}`
      : `flowRowId=${encodeURIComponent(flowRowId!)}`;
    fetch(`/api/finance/cashflow/flow-health?${qs}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (r.status === 403) {
          setForbidden(true);
          setData(null);
          return;
        }
        if (!r.ok || !json?.success) {
          setError(json?.error ?? "No se pudo cargar la cadena");
          setData(null);
          return;
        }
        setData(json.data as ChainData);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError("Error de red");
        setData(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [accountPlanId, flowRowId]);

  if (!lookup || (!accountPlanId && !flowRowId)) return null;

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[12px] text-ds-text-3",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        Resolviendo destino en el flujo…
      </div>
    );
  }

  if (forbidden) {
    return (
      <p className={cn("text-[12px] text-ds-text-4", className)}>
        Sin permiso para ver la cadena del flujo.
      </p>
    );
  }

  if (error) {
    return (
      <p className={cn("text-[12px] text-status-warn-fg", className)}>{error}</p>
    );
  }

  if (!data) return null;

  const parts: string[] = [];
  if (data.account) {
    parts.push(`${data.account.code} ${data.account.name}`);
  }
  if (data.category) {
    parts.push(data.category.name);
  }
  if (data.row) {
    parts.push(`${data.row.section} · ${data.row.name}`);
  }

  const direction = accountPlanId
    ? "cuenta → categoría → fila"
    : "fila → categoría → cuenta";

  return (
    <div
      className={cn(
        "rounded-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 space-y-1.5",
        className,
      )}
    >
      <p className="text-[12px] uppercase tracking-wide text-ds-text-4 font-mono">
        Cadena ({direction})
      </p>
      {parts.length > 0 ? (
        <p className="text-[13px] text-ds-text-1 leading-snug">
          {parts.join(" → ")}
        </p>
      ) : (
        <p className="text-[13px] text-ds-text-3">Sin cadena resuelta.</p>
      )}
      {data.warnings.length > 0 && (
        <ul className="space-y-1">
          {data.warnings.map((w) => (
            <li
              key={w}
              className="flex items-start gap-1.5 text-[12px] text-status-warn-fg"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="min-w-0">
                {w}
                {w.includes("Otros egresos") && (
                  <>
                    {" · "}
                    <Link
                      href="/opai/configuracion/finanzas/flujo-caja?tab=salud"
                      className="underline underline-offset-2 hover:text-status-warn-fg"
                    >
                      Crear fila
                    </Link>
                  </>
                )}
                {w.includes("no puede recibir") && (
                  <>
                    {" · "}
                    <Link
                      href="/opai/configuracion/finanzas/flujo-caja?tab=salud"
                      className="underline underline-offset-2 hover:text-status-warn-fg"
                    >
                      Asignar categoría
                    </Link>
                  </>
                )}
                {w.includes("Estado de Resultados") && (
                  <>
                    {" · "}
                    <Link
                      href="/opai/configuracion/finanzas/flujo-caja"
                      className="underline underline-offset-2 hover:text-status-warn-fg"
                    >
                      Revisar categoría
                    </Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
