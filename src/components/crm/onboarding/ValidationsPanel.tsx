"use client";

import { Check, X } from "lucide-react";
import type { ValidationStatus } from "./types";
import { cn } from "@/lib/utils";

const Item = ({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) => (
  <div className="flex items-center gap-2.5 py-1">
    <span
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full transition-colors",
        ok
          ? "bg-status-ok/15 text-status-ok-fg"
          : "bg-status-danger/15 text-status-danger-fg",
      )}
    >
      {ok ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : (
        <X className="h-3 w-3" strokeWidth={3} />
      )}
    </span>
    <span
      className={cn(
        "text-sm leading-tight",
        ok ? "text-ds-text-1" : "text-ds-text-2",
      )}
    >
      {label}
    </span>
  </div>
);

export function ValidationsPanel({
  validations,
}: {
  validations: ValidationStatus;
}) {
  const items = [
    { key: "osTenant", ok: validations.osTenant === "green", label: "OS-10 del tenant vigente" },
    { key: "accountInfoComplete", ok: validations.accountInfoComplete === "green", label: "Cliente con RUT y razón social" },
    { key: "installationLinked", ok: validations.installationLinked === "green", label: "Sitio creado y vinculado" },
    { key: "primaryContactWithEmail", ok: validations.primaryContactWithEmail === "green", label: "Contacto principal con email" },
    { key: "serviceStartDate", ok: validations.serviceStartDate === "green", label: "Fecha de inicio definida" },
  ];
  const okCount = items.filter((i) => i.ok).length;
  const total = items.length;

  return (
    <section
      className="rounded-xl border border-ds-border-default bg-ds-surface-1 p-4"
      aria-label="Validaciones previas"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ds-text-3">
          Pre-requisitos
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
            okCount === total
              ? "bg-status-ok/15 text-status-ok-fg"
              : "bg-status-warn/15 text-status-warn-fg",
          )}
        >
          {okCount}/{total}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {items.map((i) => (
          <Item key={i.key} ok={i.ok} label={i.label} />
        ))}
      </div>
    </section>
  );
}
