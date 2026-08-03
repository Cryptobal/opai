"use client";

import { useEffect, useRef, useState } from "react";
import { formatThousands } from "./format";
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
  const [value, setValue] = useState(initial);
  const [hint, setHint] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(value.length, value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const arith = tryEvalArithmetic(value);
  const preview =
    arith?.ok === true
      ? `= ${arith.value.toLocaleString("es-CL")}`
      : arith?.ok === false
        ? arith.reason
        : null;

  const format = (raw: string) => {
    if (raw.trimStart().startsWith("=")) return raw;
    const neg = raw.trim().startsWith("-") ? "-" : "";
    return neg + formatThousands(raw);
  };

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
        className="h-[calc(var(--plnx-row-h)-2px)] max-md:h-7 w-full rounded-none border border-primary bg-ds-surface-2 px-1 max-md:px-0.5 text-right text-ds-text-1 outline-none tabular-nums"
        aria-invalid={!!hint}
        title={hint ?? undefined}
      />
    </span>
  );
}
