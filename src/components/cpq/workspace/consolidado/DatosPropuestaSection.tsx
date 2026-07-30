"use client";

/**
 * Datos de la propuesta a nivel bundle: nombre, notas y contexto CRM
 * (cuenta/negocio/contacto heredados; solo lectura aquí).
 */

import { useEffect, useState } from "react";
import { Surface } from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

const LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export function DatosPropuestaSection({
  bundle,
  onPatch,
}: {
  bundle: BundleDetail;
  onPatch: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(bundle.name ?? "");
  const [notes, setNotes] = useState(bundle.notes ?? "");
  useEffect(() => {
    setName(bundle.name ?? "");
    setNotes(bundle.notes ?? "");
  }, [bundle.name, bundle.notes]);

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-datos-propuesta">
      <h2 className="font-display text-base text-foreground">Datos de la propuesta</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Nombre</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if ((bundle.name ?? "") !== name) void onPatch({ name: name || null });
            }}
            placeholder="Propuesta multi-instalación"
            className="h-9 bg-card text-foreground border-border text-[13px]"
          />
        </div>
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Código</Label>
          <p className="flex h-9 items-center font-mono text-[13px] text-ds-text-2">
            {bundle.code}
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className={LABEL_CLASS}>Notas internas</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((bundle.notes ?? "") !== notes) void onPatch({ notes: notes || null });
            }}
            rows={2}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Notas de la propuesta (no aparecen en el PDF)"
          />
        </div>
      </div>
      {!bundle.contact?.email && (
        <p className="rounded-md border border-status-warn-border bg-status-warn-soft/40 px-3 py-2 text-[12px] text-status-warn-fg">
          La propuesta no tiene contacto con email: asígnalo en el negocio para
          poder enviarla.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        {[
          ["Cliente", bundle.account?.name ?? "—"],
          ["Negocio", bundle.deal?.title ?? "—"],
          [
            "Contacto",
            bundle.contact
              ? `${bundle.contact.firstName} ${bundle.contact.lastName}`.trim() || "—"
              : "—",
          ],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] uppercase tracking-wide text-ds-text-3">{k}</dt>
            <dd className="mt-0.5 truncate text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
