"use client";

import { Star, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { EmptyState, Spinner } from "@/components/opai-ds";
import { isLegacyRow, type SignatureRow } from "./signature-ui";

type Props = {
  rows: SignatureRow[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect: (row: SignatureRow) => void;
  onSetDefault: (row: SignatureRow) => void;
  onDelete: (row: SignatureRow) => void;
  onConvertLegacy: (row: SignatureRow) => void;
  onCreate: () => void;
};

export function SignatureList({
  rows,
  loading,
  selectedId,
  onSelect,
  onSetDefault,
  onDelete,
  onConvertLegacy,
  onCreate,
}: Props) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Pencil}
        title="Aún no tienes firma"
        description="Crea una con nombre, contacto y logo opcional. Se anexa al enviar."
        action={
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap sm:h-10"
          >
            Nueva firma
          </button>
        }
      />
    );
  }

  return (
    <ul className="ds-list-cascade space-y-2">
      {rows.map((row) => {
        const legacy = isLegacyRow(row);
        const active = selectedId === row.id;
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className={`flex w-full min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-left ds-tap ${
                active
                  ? "border-primary/40 bg-primary/5"
                  : "border-ds-border-subtle bg-ds-surface-1 hover:bg-ds-surface-2"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ds-text-1">
                    {row.name}
                  </span>
                  {row.isDefault && (
                    <span className="rounded-md bg-status-ok-soft px-1.5 py-0.5 text-[12px] text-status-ok-fg">
                      Predeterminada
                    </span>
                  )}
                  {legacy && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-warn-soft px-1.5 py-0.5 text-[12px] text-status-warn-fg">
                      <AlertTriangle className="h-3 w-3" /> Legacy
                    </span>
                  )}
                  {!row.userId && (
                    <span className="rounded-md bg-ds-surface-3 px-1.5 py-0.5 text-[12px] text-ds-text-3">
                      Empresa
                    </span>
                  )}
                </div>
                {legacy && (
                  <p className="mt-1 text-[12px] text-ds-text-3">
                    Formato antiguo — al abrir se convierte a campos editables.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {!row.isDefault && (
                  <button
                    type="button"
                    title="Marcar predeterminada"
                    aria-label="Marcar predeterminada"
                    onClick={() => onSetDefault(row)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 hover:bg-ds-surface-2 hover:text-status-warn-fg ds-tap sm:h-9 sm:w-9"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                {legacy && (
                  <button
                    type="button"
                    onClick={() => onConvertLegacy(row)}
                    className="h-11 rounded-lg px-2 text-[12px] text-primary ds-tap sm:h-9"
                  >
                    Editar
                  </button>
                )}
                <button
                  type="button"
                  title="Eliminar"
                  aria-label="Eliminar firma"
                  onClick={() => onDelete(row)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 hover:bg-status-danger-soft hover:text-status-danger-fg ds-tap sm:h-9 sm:w-9"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
