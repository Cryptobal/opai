"use client";

import type { ValidationStatus } from "./types";
import { StatusDot } from "@/components/opai-ds/StatusDot";
import { Surface } from "@/components/opai-ds/Surface";

const Item = ({ light, label }: { light: "green" | "red"; label: string }) => (
  <div className="flex items-center gap-2 text-sm text-ds-text-2">
    <StatusDot kind={light === "green" ? "ok" : "danger"} />
    <span>{label}</span>
  </div>
);

export function ValidationsPanel({ validations }: { validations: ValidationStatus }) {
  return (
    <Surface elevation={1} padding="md" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Item light={validations.osTenant} label="OS-10 del tenant vigente" />
      <Item light={validations.accountInfoComplete} label="Cliente con RUT y razón social" />
      <Item light={validations.installationLinked} label="Sitio creado y vinculado al deal" />
      <Item light={validations.primaryContactWithEmail} label="Contacto principal con email" />
      <Item light={validations.serviceStartDate} label="Fecha de inicio definida" />
    </Surface>
  );
}
