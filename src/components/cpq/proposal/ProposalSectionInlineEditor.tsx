"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Textarea inline con autosave (debounce ~800 ms) + flush en blur.
 * Usado en la tarjeta expandida de ProposalSectionList.
 */
export function ProposalSectionInlineEditor({
  sectionId,
  content,
  disabled,
  onSave,
}: {
  sectionId: string;
  content: string;
  disabled?: boolean;
  onSave: (sectionId: string, content: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(content);
  const [state, setState] = useState<SaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(content);
  const sectionRef = useRef(sectionId);

  useEffect(() => {
    // Sync externo (generación / reload) sin pisar edición dirty
    if (sectionRef.current !== sectionId) {
      sectionRef.current = sectionId;
      setValue(content);
      latestRef.current = content;
      setState("idle");
      return;
    }
    if (state === "idle" || state === "saved") {
      setValue(content);
      latestRef.current = content;
    }
  }, [sectionId, content, state]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function flush(next: string) {
    if (disabled) return;
    if (next === latestRef.current) {
      setState((s) => (s === "dirty" ? "idle" : s));
      return;
    }
    setState("saving");
    const ok = await onSave(sectionId, next);
    if (ok) {
      latestRef.current = next;
      setState("saved");
      window.setTimeout(() => {
        setState((s) => (s === "saved" ? "idle" : s));
      }, 1500);
    } else {
      setState("error");
    }
  }

  function schedule(next: string) {
    setValue(next);
    setState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush(next);
    }, 800);
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        value={value}
        disabled={disabled}
        rows={6}
        onChange={(e) => schedule(e.target.value)}
        onBlur={() => {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          void flush(value);
        }}
        className="min-h-[9rem] w-full text-[13px] leading-relaxed"
        aria-label="Contenido de la sección"
      />
      <div className="flex min-h-5 items-center justify-between gap-2">
        <p
          className={cn(
            "text-[12px]",
            state === "error" ? "text-status-danger-fg" : "text-ds-text-3",
          )}
        >
          {state === "saving"
            ? "Guardando…"
            : state === "saved"
              ? "Guardado ✓"
              : state === "dirty"
                ? "Sin guardar"
                : state === "error"
                  ? "Error al guardar"
                  : ""}
        </p>
        {state === "error" ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-9"
            onClick={() => void flush(value)}
          >
            Reintentar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
