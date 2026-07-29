"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Forward, Reply, ReplyAll } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

export type ComposerMode = "reply" | "all" | "forward";

type Props = {
  mode: ComposerMode;
  replyAllAvailable: boolean;
  onChange: (mode: ComposerMode) => void;
  disabled?: boolean;
};

const MODE_META: Record<
  ComposerMode,
  { label: string; Icon: typeof Reply }
> = {
  reply: { label: "Responder", Icon: Reply },
  all: { label: "A todos", Icon: ReplyAll },
  forward: { label: "Reenviar", Icon: Forward },
};

/**
 * Selector Gmail-like Responder / A todos / Reenviar: botón compacto a la
 * derecha del campo Para (en lugar de tabs arriba del composer).
 */
export function ComposerModeSwitcher({
  mode,
  replyAllAvailable,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { label, Icon } = MODE_META[mode];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const options: ComposerMode[] = replyAllAvailable
    ? ["reply", "all", "forward"]
    : ["reply", "forward"];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Modo: ${label}. Cambiar`}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-0.5 rounded-md px-1.5 text-ds-text-2 ds-tap",
          "hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-50",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        <ChevronDown className="h-3.5 w-3.5 text-ds-text-3" aria-hidden />
      </button>
      {open && (
        <Surface
          elevation={4}
          padding="none"
          role="menu"
          aria-label="Modo de respuesta"
          className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden py-1"
        >
          {options.map((id) => {
            const meta = MODE_META[id];
            const ActiveIcon = meta.Icon;
            const active = id === mode;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false);
                  if (id !== mode) onChange(id);
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] ds-tap sm:min-h-9",
                  active
                    ? "bg-ds-surface-2 font-medium text-ds-text-1"
                    : "text-ds-text-1 hover:bg-ds-surface-2",
                )}
              >
                <ActiveIcon className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
                {meta.label}
              </button>
            );
          })}
        </Surface>
      )}
    </div>
  );
}
