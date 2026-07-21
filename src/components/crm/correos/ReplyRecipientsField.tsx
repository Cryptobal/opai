"use client";

import { useState } from "react";
import { X } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/**
 * Campo de destinatarios como chips editables: agrega con Enter/coma, quita
 * con ✕. Los chips con formato inválido se marcan en rojo (el caller decide
 * bloquear el envío con `isValidEmail`).
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

  function commit() {
    const v = input.trim().replace(/[,;]+$/, "").toLowerCase();
    setInput("");
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
  }

  return (
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
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !input && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? "correo@dominio.cl" : ""}
        className="h-10 min-w-[140px] flex-1 bg-transparent text-[13px] text-ds-text-1 outline-none sm:h-8"
        type="email"
        autoComplete="off"
      />
    </div>
  );
}
