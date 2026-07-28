"use client";

import { X } from "lucide-react";

export type CorreoSearchChip = {
  key: string;
  label: string;
  /** Token a quitar de la query (operador o término). */
  token: string;
};

/** Reconstruye chips a partir del query crudo (operadores + términos libres). */
export function chipsFromQuery(query: string): CorreoSearchChip[] {
  const chips: CorreoSearchChip[] = [];
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(query))) {
    const token = match[0];
    chips.push({ key: `${i}-${token}`, label: token, token });
    i += 1;
  }
  return chips;
}

/** Quita la primera ocurrencia del token (respeta frases entre comillas). */
export function removeChipFromQuery(query: string, token: string): string {
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  const parts: string[] = [];
  let removed = false;
  let match: RegExpExecArray | null;
  while ((match = re.exec(query))) {
    if (!removed && match[0] === token) {
      removed = true;
      continue;
    }
    parts.push(match[0]);
  }
  return parts.join(" ").trim();
}

type Props = {
  query: string;
  onQuery: (q: string) => void;
};

/** Chips removibles de la consulta interpretada. */
export function CorreoSearchChips({ query, onQuery }: Props) {
  const chips = chipsFromQuery(query);
  if (chips.length === 0) return null;

  return (
    <div className="flex min-w-0 gap-1.5 overflow-x-auto scrollbar-none py-1">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onQuery(removeChipFromQuery(query, chip.token))}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2 px-2.5 text-[12px] text-ds-text-2 ds-tap hover:bg-ds-surface-3 sm:h-8"
          title={`Quitar ${chip.label}`}
        >
          <span className="max-w-[12rem] truncate font-mono">{chip.label}</span>
          <X className="h-3.5 w-3.5 text-ds-text-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
