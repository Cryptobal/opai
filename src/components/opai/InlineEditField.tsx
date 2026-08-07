"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Lock, Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { confirmDialog } from "@/components/ui/confirm-service";
import { DetailFieldDisplay } from "./DetailField";
import { InlineFieldSheet } from "./InlineFieldSheet";
import { useInlineFieldSave } from "./useInlineFieldSave";
import type { NormalizeResult } from "@/lib/validations/field-normalizers";
import { BP } from "@/lib/breakpoints";

export type InlineFieldType =
  | "text"
  | "email"
  | "phone"
  | "rut"
  | "url"
  | "money"
  | "int"
  | "number"
  | "date"
  | "select"
  | "textarea";

export interface InlineEditFieldProps {
  label: string;
  hint?: string;
  value: string | null;
  type: InlineFieldType;
  fieldKey: string;
  canEdit: boolean;
  locked?: boolean;
  lockedReason?: string;
  mono?: boolean;
  fullWidth?: boolean;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /**
   * Etiqueta de la opción vacía en un `select`. Default "—". Sirve cuando el
   * valor nulo significa algo concreto (ej. "usa el contacto principal") y no
   * simplemente "sin dato".
   */
  emptyLabel?: string;
  normalize?: (raw: string) => NormalizeResult;
  /** Display formatter for read mode (e.g. money). */
  displayValue?: (value: string | null) => string | null;
  confirm?: { title: string; description: (next: string) => string };
  onCommit: (key: string, value: string | null) => Promise<string | null>;
  onFocusNext?: () => void;
  className?: string;
}

type Phase = "idle" | "editing" | "saving" | "saved" | "error";

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${BP.sm - 1}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

function defaultNormalize(raw: string): NormalizeResult {
  const s = raw.trim();
  return { ok: true, value: s === "" ? null : s };
}

export function InlineEditField({
  label,
  hint,
  value,
  type,
  fieldKey,
  canEdit,
  locked = false,
  lockedReason,
  mono = false,
  fullWidth = false,
  placeholder = "—",
  required = false,
  options,
  emptyLabel = "—",
  normalize = defaultNormalize,
  displayValue,
  confirm,
  onCommit,
  onFocusNext,
  className,
}: InlineEditFieldProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const errorId = useId();
  const narrow = useIsNarrow();
  const { commit } = useInlineFieldSave();
  const prevRef = useRef(value);
  prevRef.current = value;

  const readLabel =
    type === "select"
      ? options?.find((o) => o.value === (value ?? ""))?.label ?? value
      : displayValue
        ? displayValue(value)
        : value;

  const startEdit = useCallback(() => {
    if (!canEdit || locked) return;
    setDraft(value ?? "");
    setError(null);
    if (narrow) {
      setSheetOpen(true);
      return;
    }
    setPhase("editing");
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if ("select" in el && typeof el.select === "function" && type !== "select") {
        el.select();
      }
    });
  }, [canEdit, locked, narrow, type, value]);

  const cancel = useCallback(() => {
    setDraft(value ?? "");
    setError(null);
    setPhase("idle");
    setSheetOpen(false);
  }, [value]);

  const runSave = useCallback(
    async (raw: string, advance: boolean) => {
      if (required && raw.trim() === "") {
        setError("Campo obligatorio");
        setPhase("error");
        return;
      }
      const result = normalize(raw);
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        return;
      }

      const next = result.value;
      const prev = prevRef.current ?? null;

      if ((next ?? null) === (prev ?? null)) {
        setPhase("idle");
        setSheetOpen(false);
        if (advance) onFocusNext?.();
        return;
      }

      if (confirm) {
        const ok = await confirmDialog({
          title: confirm.title,
          description: confirm.description(next ?? ""),
        });
        if (!ok) {
          cancel();
          return;
        }
      }

      setPhase("saving");
      setError(null);
      const saved = await commit({
        key: fieldKey,
        label,
        next,
        prev,
        onCommit,
        note: result.note,
      });

      if (!saved.ok) {
        setDraft(prev ?? "");
        setError(saved.error);
        setPhase("idle");
        setSheetOpen(false);
        return;
      }

      setSheetOpen(false);
      setPhase("saved");
      window.setTimeout(() => setPhase("idle"), 1500);
      if (advance) onFocusNext?.();
    },
    [cancel, commit, confirm, fieldKey, label, normalize, onCommit, onFocusNext, required]
  );

  // Read-only / locked
  if (!canEdit || locked) {
    return (
      <DetailFieldDisplay
        label={label}
        value={readLabel}
        mono={mono}
        fullWidth={fullWidth}
        placeholder={placeholder}
        className={className}
        icon={
          locked ? (
            <Lock className="h-3.5 w-3.5 text-ds-text-3" aria-hidden />
          ) : undefined
        }
        trailing={
          locked ? (
            <span className="sr-only">{lockedReason ?? "Campo bloqueado"}</span>
          ) : undefined
        }
      />
    );
  }

  const statusHint =
    phase === "saving" ? (
      <span className="inline-flex items-center gap-1 text-[12px] font-normal normal-case tracking-normal text-ds-text-3">
        <Loader2 className="h-3 w-3 animate-spin" /> Guardando
      </span>
    ) : phase === "saved" ? (
      <span className="inline-flex items-center gap-1 text-[12px] font-normal normal-case tracking-normal text-status-ok-fg">
        <Check className="h-3 w-3" /> Guardado
      </span>
    ) : null;

  if (phase === "editing" || phase === "error") {
    const inputType =
      type === "email" ? "email" : type === "date" ? "date" : type === "url" ? "url" : "text";

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === "Enter" && type !== "textarea") {
        e.preventDefault();
        void runSave(draft, false);
        return;
      }
      if (e.key === "Tab" && type !== "textarea") {
        e.preventDefault();
        void runSave(draft, true);
      }
    };

    return (
      <div
        className={cn(
          "min-w-0 relative pl-3 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:rounded-full before:bg-primary",
          fullWidth && "sm:col-span-2",
          className
        )}
      >
        <div className="text-xs font-medium text-ds-text-3 mb-0.5 uppercase tracking-wide flex items-center gap-1.5">
          {label}
          {statusHint}
        </div>
        {type === "textarea" ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void runSave(draft, false)}
            onKeyDown={onKeyDown}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={cn("min-h-[72px] text-[13px]", mono && "font-mono", error && "border-status-danger")}
          />
        ) : type === "select" ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void runSave(draft, false)}
            onKeyDown={onKeyDown}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "flex h-9 w-full rounded-md border border-ds-border-default bg-background px-2 text-[13px]",
              error && "border-status-danger"
            )}
          >
            <option value="">{emptyLabel}</option>
            {(options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={inputType}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void runSave(draft, false)}
            onKeyDown={onKeyDown}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={cn("h-9 text-[13px]", mono && "font-mono", error && "border-status-danger")}
          />
        )}
        {error && (
          <p id={errorId} className="mt-1 text-[12px] text-status-danger-fg" role="alert">
            {error}
          </p>
        )}
        {hint && !error && <p className="mt-1 text-[12px] text-ds-text-3">{hint}</p>}
      </div>
    );
  }

  return (
    <>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(fullWidth && "sm:col-span-2")}
      >
        <DetailFieldDisplay
          label={label}
          value={readLabel}
          mono={mono}
          fullWidth={false}
          placeholder={placeholder}
          className={cn(
            phase === "saved" && "motion-safe:bg-status-ok-soft/40 rounded-md",
            className
          )}
          accent={hover || phase === "saving"}
          statusHint={statusHint}
          interactive={{
            onClick: startEdit,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startEdit();
              }
            },
            tabIndex: 0,
            "aria-label": `Editar ${label}`,
            role: "button",
          }}
          trailing={
            <Pencil
              className={cn(
                "h-3.5 w-3.5 text-ds-text-3 transition-opacity",
                hover || narrow ? "opacity-100" : "opacity-0"
              )}
              aria-hidden
            />
          }
        />
      </div>
      <InlineFieldSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) cancel();
          else setSheetOpen(true);
        }}
        label={label}
        hint={hint}
        type={type}
        value={draft}
        options={options}
        emptyLabel={emptyLabel}
        mono={mono}
        error={error}
        saving={phase === "saving"}
        onSave={(raw) => void runSave(raw, false)}
      />
    </>
  );
}
