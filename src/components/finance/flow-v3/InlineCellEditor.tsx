"use client";

import { useEffect, useRef, useState } from "react";
import { formatThousands, NUM_CLASS } from "./format";
import { tryEvalArithmetic } from "./eval-arithmetic";

/** Editor inline de celda: acepta montos CLP o expresiones `=…` con preview. */
export function InlineCellEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
}) {
  const format = (raw: string) => {
    if (raw.trimStart().startsWith("=")) return raw;
    const neg = raw.trim().startsWith("-") ? "-" : "";
    return neg + formatThousands(raw);
  };

  const [value, setValue] = useState(() => format(initial));
  const [hint, setHint] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Con valor precargado (Enter / doble clic): seleccionar todo para
    // reemplazar de inmediato o Cmd+A / Backspace. Con tipeo de dígito: cursor al final.
    if (initial) el.select();
    else el.setSelectionRange(value.length, value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const arith = tryEvalArithmetic(value);
  const preview =
    arith?.ok === true
      ? `= ${arith.value.toLocaleString("es-CL")}`
      : arith?.ok === false
        ? arith.reason
        : null;

  const commit = (move: "down" | "right" | "none") => {
    const evaled = tryEvalArithmetic(value);
    if (evaled) {
      if (!evaled.ok) {
        setHint(evaled.reason);
        return;
      }
      onCommit(String(evaled.value), move);
      return;
    }
    onCommit(value, move);
  };

  return (
    <span className="relative block h-full w-full">
      {preview && (
        <span
          className={`pointer-events-none absolute -top-4 right-0 z-20 rounded bg-ds-surface-3 px-1 text-[12px] tabular-nums ${
            arith?.ok ? "text-status-ok-fg" : "text-status-warn-fg"
          }`}
        >
          {preview}
        </span>
      )}
      <input
        ref={ref}
        value={value}
        inputMode={value.trimStart().startsWith("=") ? "text" : "numeric"}
        onChange={(e) => {
          setHint(null);
          setValue(format(e.target.value));
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          const mod = e.metaKey || e.ctrlKey;
          if (mod && (e.key === "a" || e.key === "A")) {
            e.preventDefault();
            e.currentTarget.select();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            commit("down");
          } else if (e.key === "Tab") {
            e.preventDefault();
            commit("right");
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => commit("none")}
        className={`h-full max-h-full w-full min-h-0 rounded-none border border-primary bg-ds-surface-2 px-1 max-md:px-0.5 text-right text-ds-text-1 outline-none ${NUM_CLASS}`}
        style={{ fontSize: "inherit", fontWeight: 400, lineHeight: "inherit" }}
        aria-invalid={!!hint}
        title={hint ?? undefined}
      />
    </span>
  );
}
