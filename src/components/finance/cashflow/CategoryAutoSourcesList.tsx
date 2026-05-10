"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";

interface AutoSource {
  kind: string;
  id: string;
  label: string;
  description: string | null;
  monthlyAmount: number;
  link: string;
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const HINT_BY_CODE: Record<string, string> = {
  ING_VENTA_CONTRATO:
    "Cada cotización aceptada con fecha de inicio se proyecta mensualmente.",
  EGR_SUELDO:
    "Sueldos se proyectan automáticamente desde la dotación operativa configurada.",
  EGR_TURNO_EXTRA:
    "Promedio rolling de los últimos 8 lotes de turnos extra por instalación.",
  EGR_IVA_F29:
    "F29 = IVA débito (DTEs emitidos) − IVA crédito (DTEs recibidos). Pago día 12 del mes siguiente.",
};

export function CategoryAutoSourcesList({ categoryId }: { categoryId: string }) {
  const [sources, setSources] = useState<AutoSource[]>([]);
  const [categoryCode, setCategoryCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/finance/cashflow/categorias/${categoryId}/auto-sources`,
        );
        const j = await r.json();
        if (j?.success) {
          setCategoryCode(j.data.categoryCode);
          setSources(j.data.sources);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [categoryId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[12px] text-ds-text-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando fuentes...
      </div>
    );
  }

  const hint = HINT_BY_CODE[categoryCode];
  if (!hint) return null;

  return (
    <div className="space-y-2 rounded-ds-sm bg-status-info-soft/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 text-status-info-fg shrink-0" />
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[12px] text-ds-text-2">
            <strong>Generador automático:</strong> {hint}
          </p>
          {sources.length > 0 && (
            <ul className="space-y-1 mt-2">
              {sources.map((s) => (
                <li key={s.id} className="text-[12px] flex items-center gap-2">
                  <Link
                    href={s.link}
                    className="text-status-info-fg hover:underline truncate flex-1 inline-flex items-center gap-1"
                  >
                    {s.label}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                  <span className="font-mono text-[12px] text-ds-text-3 shrink-0">
                    ${fmt.format(s.monthlyAmount)}/mes
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
