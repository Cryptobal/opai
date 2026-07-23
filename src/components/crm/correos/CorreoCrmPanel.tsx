"use client";

import { useState, type ReactNode } from "react";
import { Building2, ChevronDown } from "lucide-react";

type Props = {
  /** Contenido CRM (Crear lead, Asociar, Vincular, Tareas, Contacto). */
  children: ReactNode;
};

/**
 * Panel comercial plegable al fondo del lector (rediseño Gmail): agrupa las
 * acciones CRM (Crear lead con IA, Asociar, Vincular, Tareas, Contacto) para
 * que el correo y la respuesta sean el protagonista y el CRM quede accesible
 * pero sin pesar. Abierto por defecto; el usuario lo pliega si quiere.
 * Mobile-first: header táctil ≥44px, todo apilado.
 */
export function CorreoCrmPanel({ children }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <section className="mt-1 overflow-hidden rounded-2xl border border-ds-border-subtle bg-ds-surface-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left ds-tap"
      >
        <Building2 className="h-4 w-4 shrink-0 text-tint-violet-fg" />
        <span className="text-[13px] font-semibold text-ds-text-1">Panel comercial</span>
        <span className="rounded-full bg-tint-violet/25 px-1.5 py-0.5 text-[12px] font-medium text-tint-violet-fg">CRM</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-ds-text-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="space-y-3 px-3 pb-3.5 pt-0.5">{children}</div>}
    </section>
  );
}
