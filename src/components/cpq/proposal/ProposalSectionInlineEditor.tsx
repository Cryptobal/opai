"use client";

/**
 * Edición inline del cuerpo de una sección de propuesta, con autosave por
 * debounce (~800 ms). Reemplaza al modal como camino por defecto: el Sheet
 * queda solo como modo foco ("Ampliar").
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProposalSectionInlineEditor({
  sectionId,
  value,
  onSave,
  disabled,
}: {
  sectionId: string;
  value: string;
  /** Persiste el contenido. Devuelve true si se guardó. */
  onSave: (sectionId: string, content: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<SaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  const savedValueRef = useRef(value);

  // Contenido nuevo desde el servidor (regeneración, conflicto resuelto) sin
  // pisar lo que el usuario está escribiendo.
  useEffect(() => {
    if (pendingRef.current !== null) return;
    savedValueRef.current = value;
    setDraft(value);
  }, [value, sectionId]);

  const flush = useCallback(async () => {
    const content = pendingRef.current;
    if (content === null) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState("saving");
    const ok = await onSave(sectionId, content);
    if (ok) {
      savedValueRef.current = content;
      pendingRef.current = null;
      setState("saved");
    } else {
      setState("error");
    }
  }, [onSave, sectionId]);

  // Guarda lo pendiente al desmontar (cerrar la tarjeta, cambiar de vista).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(next: string) {
    setDraft(next);
    if (next === savedValueRef.current) {
      pendingRef.current = null;
      setState("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    pendingRef.current = next;
    setState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={draft}
        disabled={disabled}
        rows={Math.min(24, Math.max(6, draft.split("\n").length + 1))}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => void flush()}
        placeholder="Escribe el contenido de esta sección o genérala con IA."
        aria-label="Contenido de la sección"
        className="min-h-[9rem] w-full text-[13px] leading-relaxed"
      />
      <div className="flex min-h-5 items-center gap-2 text-[12px] text-ds-text-3">
        {state === "saving" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando…
          </>
        ) : state === "saved" ? (
          <>
            <Check className="h-3.5 w-3.5 text-status-ok-fg" />
            Guardado
          </>
        ) : state === "error" ? (
          <>
            <span className="text-status-danger-fg">No se pudo guardar.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-[12px]"
              onClick={() => void flush()}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
