"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  useRecipientSuggestions,
  type RecipientSuggestion,
} from "@/components/crm/correos/useRecipientSuggestions";

/**
 * Input de destinatario único con typeahead (C21a) para los composers de
 * negocio: sugiere contactos CRM + frecuentes del usuario (↑↓ Enter Esc,
 * chip de origen) y acepta cualquier email escrito a mano. El valor es un
 * string simple para no cambiar el contrato del composer.
 */
export function RecipientTypeaheadInput({
  value,
  onChange,
  placeholder = "correo@cliente.com",
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const { suggestions } = useRecipientSuggestions(open ? value : "");
  const showList = open && value.trim().length > 0 && suggestions.length > 0;

  useEffect(() => {
    setHighlight(suggestions.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, suggestions.length]);

  useEffect(() => {
    if (!showList) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showList]);

  function pick(s: RecipientSuggestion) {
    onChange(s.email);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (showList && e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (showList && e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (showList && e.key === "Enter") {
            e.preventDefault();
            if (highlight >= 0 && suggestions[highlight]) pick(suggestions[highlight]);
            else setOpen(false);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        type="email"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ds-border-default bg-ds-surface-1 py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.email} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${
                  i === highlight ? "bg-ds-surface-2" : ""
                }`}
              >
                <span className="min-w-0">
                  {s.name && (
                    <span className="block truncate text-[13px] text-ds-text-1">
                      {s.name}
                    </span>
                  )}
                  <span className="block truncate text-[12px] text-ds-text-3">
                    {s.email}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[12px] ${
                    s.source === "crm"
                      ? "bg-status-info-soft text-status-info-fg"
                      : "bg-ds-surface-2 text-ds-text-3"
                  }`}
                >
                  {s.source === "crm" ? "CRM" : "reciente"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
