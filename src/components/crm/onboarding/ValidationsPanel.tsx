"use client";

import type { ValidationStatus } from "./types";

const Dot = ({ light, label }: { light: "green" | "red"; label: string }) => (
  <div className="flex items-center gap-2 text-sm">
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        light === "green" ? "bg-emerald-500" : "bg-rose-500"
      }`}
      aria-hidden
    />
    <span className="text-muted-foreground">{label}</span>
  </div>
);

export function ValidationsPanel({
  validations,
}: {
  validations: ValidationStatus;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/40 p-3 sm:grid-cols-2">
      <Dot light={validations.osTenant} label="OS-10 del tenant vigente" />
      <Dot
        light={validations.accountInfoComplete}
        label="Cliente con RUT y razón social"
      />
      <Dot
        light={validations.installationLinked}
        label="Sitio creado y vinculado al deal"
      />
      <Dot
        light={validations.primaryContactWithEmail}
        label="Contacto principal con email"
      />
      <Dot
        light={validations.serviceStartDate}
        label="Fecha de inicio definida"
      />
    </div>
  );
}
