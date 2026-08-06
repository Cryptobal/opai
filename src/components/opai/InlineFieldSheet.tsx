"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InlineFieldType } from "./InlineEditField";

interface InlineFieldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  hint?: string;
  type: InlineFieldType;
  value: string;
  options?: { value: string; label: string }[];
  mono?: boolean;
  error?: string | null;
  saving?: boolean;
  onSave: (raw: string) => void;
}

export function InlineFieldSheet({
  open,
  onOpenChange,
  label,
  hint,
  type,
  value,
  options,
  mono,
  error,
  saving,
  onSave,
}: InlineFieldSheetProps) {
  const [draft, setDraft] = useState(value);
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      // Foco al abrir
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, value]);

  const inputType =
    type === "email"
      ? "email"
      : type === "date"
        ? "date"
        : type === "url"
          ? "url"
          : type === "number" || type === "money" || type === "int"
            ? "text"
            : "text";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          {hint && <DialogDescription>{hint}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2 py-2">
          {type === "textarea" ? (
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={label}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                "min-h-[120px] text-[13px]",
                mono && "font-mono",
                error && "border-status-danger"
              )}
            />
          ) : type === "select" ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={label}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                "flex h-11 w-full rounded-md border border-ds-border-default bg-background px-3 text-[13px]",
                error && "border-status-danger"
              )}
            >
              <option value="">—</option>
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
              aria-label={label}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                "h-11 text-[13px]",
                mono && "font-mono",
                error && "border-status-danger"
              )}
            />
          )}
          {error && (
            <p id={errorId} className="text-[12px] text-status-danger-fg" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 w-full sm:w-auto"
            disabled={saving}
            onClick={() => onSave(draft)}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
