"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

/** Anula el :focus-visible global (ring + ring-offset) que pinta rectángulos
 *  blancos sobre Para/Asunto — mismo patrón que ChatComposer. */
const INPUT_FOCUS_RESET =
  "appearance-none border-0 bg-transparent shadow-none outline-none " +
  "focus:border-0 focus:outline-none focus:ring-0 focus:ring-offset-0 " +
  "focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0";

/**
 * Campo de destinatarios estilo Gmail: fila underline + chips con avatar/nombre
 * + typeahead (CRM + recientes + participantes del mailbox). Flechas/Enter
 * navegan el listado sin filtrar a los atajos de bandeja.
 */
export function ReplyRecipientsField({
  label,
  values,
  onChange,
  actions,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Controles a la derecha de la fila (modo Responder/Reenviar, Cc/Cco). */
  actions?: ReactNode;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [names, setNames] = useState<Record<string, string>>({});
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placeAbove: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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
      if (!rootRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showList]);

  // Posicionar el menú en portal (evita clip del overflow del lector) y
  // abrirlo hacia arriba si no hay espacio abajo.
  useLayoutEffect(() => {
    if (!showList) {
      setMenuBox(null);
      return;
    }
    const update = () => {
      const anchor = rootRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(280, placeAbove ? spaceAbove - 8 : spaceBelow - 8));
      setMenuBox({
        top: placeAbove ? rect.top - gap : rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        maxHeight,
        placeAbove,
      });
    };
    update();
    window.addEventListener("resize", update);
    // El scroller del lector mueve el ancla — reposicionar.
    const scroller = rootRef.current?.closest(".overflow-y-auto");
    scroller?.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      scroller?.removeEventListener("scroll", update);
    };
  }, [showList, visible.length, input]);

  // Mantener la opción resaltada visible dentro del menú.
  useEffect(() => {
    if (!showList || highlight < 0) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlight, showList]);

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

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Evita que los atajos de bandeja (↑/↓ cambian de hilo) se coman el typeahead.
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === ",") {
      e.stopPropagation();
    }

    if (showList && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % visible.length);
      return;
    }
    if (showList && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + visible.length) % visible.length);
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (showList && highlight >= 0 && visible[highlight]) {
        pick(visible[highlight]);
      } else {
        commitFreeText();
      }
    } else if (e.key === "Backspace" && !input && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div ref={rootRef} className="relative" data-recipient-field>
      <div
        className={cn(
          "flex min-h-11 items-start gap-1 border-b border-ds-border-subtle",
          "focus-within:border-ds-border-strong",
        )}
      >
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-2"
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
                  "inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[12px]",
                  ok
                    ? "bg-ds-surface-2 text-ds-text-1"
                    : "bg-status-danger-soft text-status-danger-fg",
                )}
              >
                <span className="max-w-[12rem] truncate">{labelText}</span>
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
            onKeyDown={onKeyDown}
            onBlur={() => {
              setTimeout(() => {
                if (
                  !rootRef.current?.contains(document.activeElement) &&
                  !listRef.current?.contains(document.activeElement)
                ) {
                  commitFreeText();
                }
              }, 120);
            }}
            placeholder={values.length === 0 ? "Buscar nombre o correo" : ""}
            className={cn(
              "h-8 min-w-[140px] flex-1 text-[16px] text-ds-text-1 placeholder:text-ds-text-4 sm:text-ds-body",
              INPUT_FOCUS_RESET,
            )}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showList}
            aria-autocomplete="list"
            aria-controls={showList ? `recipient-list-${label}` : undefined}
            aria-activedescendant={
              showList && highlight >= 0 ? `recipient-opt-${label}-${highlight}` : undefined
            }
          />
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1 self-center py-1">{actions}</div>
        ) : null}
      </div>
      {showList &&
        menuBox &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={listRef}
            id={`recipient-list-${label}`}
            role="listbox"
            style={{
              position: "fixed",
              top: menuBox.placeAbove ? undefined : menuBox.top,
              bottom: menuBox.placeAbove
                ? window.innerHeight - menuBox.top
                : undefined,
              left: menuBox.left,
              width: menuBox.width,
              maxHeight: menuBox.maxHeight,
            }}
            className="z-[80] overflow-y-auto rounded-xl border border-ds-border-default bg-ds-surface-1 py-1 shadow-lg"
          >
            {visible.map((s, i) => {
              const name = s.name?.trim() || displayName(s.email, null);
              return (
                <li
                  key={s.email}
                  id={`recipient-opt-${label}-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  data-idx={i}
                >
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
                      <span className="block truncate text-ds-body text-ds-text-1">{name}</span>
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
          </ul>,
          document.body,
        )}
    </div>
  );
}
