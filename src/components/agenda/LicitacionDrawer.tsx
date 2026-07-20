"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Surface, Tag, Spinner } from "@/components/opai-ds";

type Props = {
  dealId: string | null;
  onClose: () => void;
  onAgendar?: () => void;
};

export function LicitacionDrawer({ dealId, onClose, onAgendar }: Props) {
  const [comms, setComms] = useState<{
    emails: Array<{ fecha: string; de: string; asunto: string; direction: string }>;
    quotes: Array<{ codigo: string; monto: number; estado: string }>;
    checklist: { cotizacion: boolean; correos: boolean; bases: boolean };
  } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!dealId) return;
    fetch(`/api/agenda/licitaciones/${dealId}/comunicaciones`)
      .then((r) => r.json())
      .then(setComms)
      .catch(() => setComms(null));
  }, [dealId]);

  if (!dealId) return null;

  async function generateSummary() {
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/agenda/licitaciones/${dealId}/resumen`, { method: "POST" });
      const json = await res.json();
      setSummary(json.summary || "Sin resumen");
    } finally {
      setLoadingSummary(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <Surface
        elevation={2}
        padding="md"
        className="h-full w-full max-w-md space-y-4 overflow-y-auto"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-semibold">Licitación</p>
          <button type="button" onClick={onClose} className="text-[13px] text-ds-text-3">
            Cerrar
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Tag size="sm" variant={comms?.checklist.cotizacion ? "ok" : "warn"}>
            Cotización {comms?.checklist.cotizacion ? "✓" : "pendiente"}
          </Tag>
          <Tag size="sm" variant={comms?.checklist.correos ? "ok" : "warn"}>
            Correos {comms?.checklist.correos ? "✓" : "0"}
          </Tag>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Conversación</p>
          {!comms ? (
            <Spinner />
          ) : (
            <ul className="space-y-1.5">
              {(comms.emails ?? []).map((e, idx) => (
                <li key={idx} className="rounded-lg bg-ds-surface-2 px-2 py-1.5 text-[12px]">
                  <span className="text-ds-text-3">{e.direction}</span> · {e.de}
                  <p className="truncate text-ds-text-1">{e.asunto}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Resumen IA</p>
          <button
            type="button"
            onClick={() => void generateSummary()}
            className="h-10 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
          >
            {loadingSummary ? "Generando…" : "Generar"}
          </button>
          {summary && <p className="text-[13px] text-ds-text-2">{summary}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/crm/deals/${dealId}`}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-3 text-[13px] text-primary-foreground ds-tap sm:h-9"
          >
            Abrir negocio
          </Link>
          <Link
            href={`/crm/cotizaciones?dealId=${dealId}`}
            className="inline-flex h-10 items-center rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
          >
            Ver cotizaciones
          </Link>
          <button
            type="button"
            onClick={onAgendar}
            className="inline-flex h-10 items-center rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
          >
            Agendar visita
          </button>
        </div>
      </Surface>
    </div>
  );
}
