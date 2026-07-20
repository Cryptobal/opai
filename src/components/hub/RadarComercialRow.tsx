"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { type RadarItemDTO, kindIcon, ctaFor } from "./radar-hub-item";

type Props = {
  item: RadarItemDTO;
  busy: boolean;
  onResolve: (id: string, status: "DONE" | "DISMISSED") => void;
};

export function RadarComercialRow({ item, busy, onResolve }: Props) {
  const cta = ctaFor(item);
  return (
    <li className="flex items-start gap-2.5 rounded-lg bg-ds-surface-2 px-2.5 py-2">
      <span className="text-base leading-5" aria-hidden>
        {kindIcon(item.kind)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ds-text-1">{item.title}</p>
        {item.summary && <p className="truncate text-[12px] text-ds-text-3">{item.summary}</p>}
        <Link href={cta.href} className="mt-0.5 inline-block text-[12px] font-medium text-primary ds-tap">
          {cta.label} →
        </Link>
      </div>
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
    </li>
  );
}
