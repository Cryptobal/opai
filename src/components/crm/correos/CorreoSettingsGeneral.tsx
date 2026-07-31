"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SimpleSelect } from "@/components/ui/simple-select";
import type {
  CorreoPreviewLines,
  CorreoUndoSeconds,
} from "./useCorreosViewPreferences";
import { CORREO_UNDO_SECONDS_OPTIONS } from "./useCorreosViewPreferences";

const DENSITY: { value: CorreoPreviewLines; label: string }[] = [
  { value: 1, label: "Compacta" },
  { value: 2, label: "Cómoda" },
  { value: 3, label: "Amplia" },
];

type Props = {
  previewLines: CorreoPreviewLines;
  onPreviewLines: (lines: CorreoPreviewLines) => void;
  undoSeconds: CorreoUndoSeconds;
  onUndoSeconds: (seconds: CorreoUndoSeconds) => void;
  advanceAfterRemove: boolean;
  onAdvanceAfterRemove: (next: boolean) => void;
};

export function CorreoSettingsGeneral({
  previewLines, onPreviewLines,
  undoSeconds, onUndoSeconds,
  advanceAfterRemove, onAdvanceAfterRemove,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-ds-text-2">Densidad de bandeja</p>
        <div
          role="radiogroup"
          aria-label="Densidad de bandeja"
          className="inline-flex w-full rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-0.5"
        >
          {DENSITY.map((opt) => {
            const active = previewLines === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPreviewLines(opt.value)}
                className={`flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg text-[13px] font-medium ds-tap ${
                  active
                    ? "bg-ds-surface-2 text-primary shadow-ds-xs"
                    : "text-ds-text-3 hover:text-ds-text-1"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
        <span className="min-w-0 text-[13px] text-ds-text-2">Tiempo para deshacer</span>
        <SimpleSelect
          value={String(undoSeconds)}
          onValueChange={(v) => onUndoSeconds(Number(v) as CorreoUndoSeconds)}
          aria-label="Tiempo para deshacer"
          className="h-11 min-w-0 max-w-[6rem] border-0 bg-transparent"
          options={CORREO_UNDO_SECONDS_OPTIONS.map((seconds) => ({
            value: String(seconds),
            label: `${seconds} s`,
          }))}
        />
      </label>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5">
        <input
          type="checkbox"
          role="switch"
          checked={advanceAfterRemove}
          onChange={(e) => onAdvanceAfterRemove(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span className="min-w-0">
          <span className="block text-[13px] text-ds-text-2">
            Avanzar al siguiente hilo
          </span>
          <span className="block text-[12px] text-ds-text-4">
            Tras archivar o eliminar con el lector abierto
          </span>
        </span>
      </label>

      <Link
        href="/opai/configuracion/correos-automaticos"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 text-[13px] text-ds-text-2 transition-colors hover:bg-ds-surface-2 ds-tap"
      >
        Correos automáticos
        <ExternalLink className="h-3.5 w-3.5 text-ds-text-4" />
      </Link>
    </div>
  );
}
