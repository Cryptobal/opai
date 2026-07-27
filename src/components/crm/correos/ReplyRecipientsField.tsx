"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  useRecipientSuggestions,
  type RecipientSuggestion,
} from "./useRecipientSuggestions";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Acepta email puro o header `Nombre <mail@x.cl>`. */
export function isValidEmail(value: string): boolean {
  if (EMAIL_RE.test(value.trim())) return true;
  return extractEmailAddresses(value).length > 0;
}

/** Normaliza a email lowercase; soporta `Nombre <mail>`. */
export function normalizeRecipient(value: string): string | null {
  const extracted = extractEmailAddresses(value)[0];
  if (extracted) return extracted;
  const fallback = normalizeEmailAddress(value);
  return EMAIL_RE.test(fallback) ? fallback : null;
}

export function normalizeRecipientList(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const n = normalizeRecipient(v);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function displayName(email: string, name: string | null | undefined): string {
  const n = name?.trim();
  if (n) return n;
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._+]+/g, " ");
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || "?").toUpperCase();
}

function nameFromRawHeader(raw: string): string | null {
  const match = raw.trim().match(/^"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  const name = (match?.[1] ?? "").replace(/"/g, "").trim();
  return name || null;
}

/**
 * Campo de destinatarios estilo Gmail: fila underline + chips con avatar/nombre
 * + typeahead (CRM + recientes + participantes del mailbox).
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
  const [names, setNames] = useState<Record<string, string>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Si el padre manda headers `Nombre <mail>`, normalizamos y guardamos el nombre.
  useEffect(() => {
    let dirty = false;
    const next: string[] = [];
    const namePatch: Record<string, string> = {};
    for (const v of values) {
      const email = normalizeRecipient(v) ?? normalizeEmailAddress(v);
      const headerName = nameFromRawHeader(v);
      if (headerName && email) namePatch[email] = headerName;
      if (email && !next.includes(email)) next.push(email);
      if (email !== v.trim().toLowerCase()) dirty = true;
    }
    if (Object.keys(namePatch).length) {
      setNames((prev) => ({ ...prev, ...namePatch }));
    }
    if (dirty) onChange(next);
    // Solo al cambiar `values` externos con formato header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.join("|")]);

  const { suggestions } = useRecipientSuggestions(input);
  const visible = suggestions.filter((s) => !values.includes(s.email));
  const showList = open && input.trim().length > 0 && visible.length > 0;

  useEffect(() => {
    setHighlight(visible.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, visible.length]);

  useEffect(() => {
    if (!showList) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showList]);

  function rememberName(email: string, name: string | null | undefined) {
    if (!name?.trim()) return;
    setNames((prev) => (prev[email] ? prev : { ...prev, [email]: name.trim() }));
  }

  function add(email: string, name?: string | null) {
    const v = normalizeRecipient(email) ?? normalizeEmailAddress(email);
    if (!v) return;
    rememberName(v, name ?? nameFromRawHeader(email));
    if (!values.includes(v)) onChange([...normalizeRecipientList(values), v]);
    setInput("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function commitFreeText() {
    const raw = input.trim().replace(/[,;]+$/, "");
    setInput("");
    setOpen(false);
    if (!raw) return;
    add(raw, nameFromRawHeader(raw));
  }

  function pick(s: RecipientSuggestion) {
    add(s.email, s.name);
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 border-b border-ds-border-default py-1.5",
          "focus-within:border-primary",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <span className="w-10 shrink-0 text-[12px] text-ds-text-3">{label}</span>
        {values.map((v) => {
          const email = normalizeRecipient(v) ?? v;
          const ok = isValidEmail(v);
          const labelText = displayName(email, names[email]);
          return (
            <span
              key={v}
              title={email}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 text-[12px]",
                ok
                  ? "bg-ds-surface-2 text-ds-text-1"
                  : "bg-status-danger-soft text-status-danger-fg",
              )}
            >
              <span
                aria-hidden
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary"
              >
                {initials(labelText)}
              </span>
              <span className="max-w-[10rem] truncate">{labelText}</span>
              <button
                type="button"
                aria-label={`Quitar ${email}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(values.filter((x) => x !== v));
                }}
                className="rounded-full p-0.5 text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
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
            setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                commitFreeText();
              }
            }, 120);
          }}
          placeholder={values.length === 0 ? "Buscar nombre o correo" : ""}
          className="h-8 min-w-[140px] flex-1 bg-transparent text-[16px] text-ds-text-1 outline-none placeholder:text-ds-text-4 sm:text-[13px]"
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
        />
      </div>
      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-ds-border-default bg-ds-surface-1 py-1 shadow-lg"
        >
          {visible.map((s, i) => {
            const name = s.name?.trim() || displayName(s.email, null);
            return (
              <li key={s.email} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                    i === highlight ? "bg-ds-surface-2" : "",
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary"
                  >
                    {initials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ds-text-1">{name}</span>
                    <span className="block truncate text-[12px] text-ds-text-3">{s.email}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[12px]",
                      s.source === "crm"
                        ? "bg-status-info-soft text-status-info-fg"
                        : s.source === "mailbox"
                          ? "bg-status-ok-soft text-status-ok-fg"
                          : "bg-ds-surface-2 text-ds-text-3",
                    )}
                  >
                    {s.source === "crm" ? "CRM" : s.source === "mailbox" ? "bandeja" : "reciente"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
