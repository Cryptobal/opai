"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { type RadarItemDTO, kindIcon, kindLabel, cleanTitle, ctaFor } from "./radar-hub-item";

type Props = {
  item: RadarItemDTO;
  busy: boolean;
  onResolve: (id: string, status: "DONE" | "DISMISSED") => void;
  onOpenThread: (threadId: string) => void;
};

export function RadarComercialRow({ item, busy, onResolve, onOpenThread }: Props) {
  const cta = ctaFor(item);
  const threadId = item.threadId;
  // Los leads se aprueban/rechazan con etiquetas explícitas: además de resolver
  // la novedad, alimentan el aprendizaje del clasificador (Es lead / No es lead).
  const isLead = item.kind === "nuevo_lead";
  const title = cleanTitle(item.title);
  // Etiqueta de tipo salvo en leads (ahí los botones ya lo dejan claro): así
  // de un vistazo se distingue señal de compra de compromiso.
  const label = isLead ? null : kindLabel(item.kind);
  const body = (
    <>
      {label && (
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">{label}</p>
      )}
      <p className="truncate text-[13px] font-medium text-ds-text-1">{title}</p>
      {item.summary && <p className="truncate text-[12px] text-ds-text-3">{item.summary}</p>}
    </>
  );
  return (
    <li className="rounded-lg bg-ds-surface-2 px-2.5 py-2">
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-5" aria-hidden>
          {kindIcon(item.kind)}
        </span>
        <div className="min-w-0 flex-1">
          {threadId ? (
            // Tocar el título/resumen abre el correo real (lectura de contexto).
            <button
              type="button"
              onClick={() => onOpenThread(threadId)}
              className="block w-full text-left ds-tap"
            >
              {body}
            </button>
          ) : (
            body
          )}
          <Link href={cta.href} className="mt-0.5 inline-block text-[12px] font-medium text-primary ds-tap">
            {cta.label} →
          </Link>
        </div>
        {!isLead && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(item.id, "DONE")}
              title="Marcar como hecho"
              className="rounded-md p-1 text-ds-text-4 hover:text-status-ok-fg ds-tap disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(item.id, "DISMISSED")}
              title="Descartar"
              className="rounded-md p-1 text-ds-text-4 hover:text-status-danger-fg ds-tap disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {isLead && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(item.id, "DONE")}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-status-ok-border bg-status-ok-soft px-2 py-1.5 text-[12px] font-medium text-status-ok-fg ds-tap disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            Es lead
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(item.id, "DISMISSED")}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-status-danger-border px-2 py-1.5 text-[12px] font-medium text-status-danger-fg ds-tap disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
            No es lead
          </button>
        </div>
      )}
    </li>
  );
}
