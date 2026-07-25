"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  useRecipientSuggestions,
  type RecipientSuggestion,
} from "./useRecipientSuggestions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/**
 * Campo de destinatarios como chips editables con typeahead (C21a): sugiere
 * contactos CRM + destinatarios frecuentes del usuario mientras se escribe
 * (↑↓ Enter Esc, chip de origen CRM/reciente) y sigue aceptando cualquier
 * email válido escrito a mano (Enter/coma). Quita con ✕; los chips con
 * formato inválido se marcan en rojo (el caller decide bloquear el envío
 * con `isValidEmail`).
 */
export function ReplyRecipientsField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const { suggestions } = useRecipientSuggestions(input);
  const visible = suggestions.filter((s) => !values.includes(s.email));
  const showList = open && input.trim().length > 0 && visible.length > 0;

  useEffect(() => {
    setHighlight(visible.length > 0 ? 0 : -1);
    // Solo cuando cambia la lista visible por tipeo; no depende de highlight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, visible.length]);

  // Cierra el dropdown al hacer clic fuera.
  useEffect(() => {
    if (!showList) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showList]);

  function add(email: string) {
    const v = email.trim().toLowerCase();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setInput("");
    setOpen(false);
  }

  function commitFreeText() {
    const v = input.trim().replace(/[,;]+$/, "").toLowerCase();
    setInput("");
    setOpen(false);
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
  }

  function pick(s: RecipientSuggestion) {
    add(s.email);
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 py-1.5">
        <span className="text-[12px] text-ds-text-3">{label}</span>
        {values.map((v) => (
          <span
            key={v}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] ${
              isValidEmail(v)
                ? "bg-ds-surface-2 text-ds-text-1"
                : "bg-status-danger-soft text-status-danger-fg"
            }`}
          >
            {v}
            <button
              type="button"
              aria-label={`Quitar ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="ds-tap"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (showList && e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % visible.length);
            } else if (showList && e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + visible.length) % visible.length);
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (showList && highlight >= 0 && visible[highlight]) {
                pick(visible[highlight]);
              } else {
                commitFreeText();
              }
            } else if (e.key === "Backspace" && !input && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            // El pointerdown de una sugerencia corre antes que el blur-commit.
            setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                commitFreeText();
              }
            }, 120);
          }}
          placeholder={values.length === 0 ? "correo@dominio.cl" : ""}
          className="h-10 min-w-[140px] flex-1 bg-transparent text-[16px] text-ds-text-1 outline-none sm:h-8 sm:text-[13px]"
          type="email"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
        />
      </div>
      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ds-border-default bg-ds-surface-1 py-1 shadow-lg"
        >
          {visible.map((s, i) => (
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
