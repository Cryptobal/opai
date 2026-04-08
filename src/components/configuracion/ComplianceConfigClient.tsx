"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Save, Shield, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  initialDpoContactEmail: string | null;
  dpaAcceptedAt: string | null;
  dpaAcceptedBy: string | null;
  dpaVersion: string | null;
}

export function ComplianceConfigClient({
  initialDpoContactEmail,
  dpaAcceptedAt,
  dpaAcceptedBy,
  dpaVersion,
}: Props) {
  const [dpoEmail, setDpoEmail] = useState(initialDpoContactEmail ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/dpo-contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dpoContactEmail: dpoEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo guardar el contacto del DPO");
      }
      toast.success("Contacto del DPO actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const formattedDpaDate = dpaAcceptedAt
    ? new Date(dpaAcceptedAt).toLocaleString("es-CL", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
        <header className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Contacto del DPO</h2>
            <p className="text-xs text-muted-foreground">
              Email al que se dirigirán los guardias y clientes para ejercer sus derechos ARCO
              (acceso, rectificación, cancelación, oposición). Si se deja vacío, se usa el
              fallback genérico de Opai.
            </p>
          </div>
        </header>

        <div className="space-y-1.5">
          <Label htmlFor="dpoContactEmail">Email del DPO</Label>
          <Input
            id="dpoContactEmail"
            type="email"
            placeholder="privacidad@mi-empresa.cl"
            value={dpoEmail}
            onChange={(e) => setDpoEmail(e.target.value)}
            disabled={saving}
          />
          <p className="text-[11px] text-muted-foreground">
            Se expone al guardia en el portal (Mis datos) como contacto para ejercer sus
            derechos. Dejarlo vacío usa el fallback <code>datos@opai.cl</code>.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
        <header className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileCheck2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Contrato de Encargado de Tratamiento (DPA)
            </h2>
            <p className="text-xs text-muted-foreground">
              Estado del contrato que regula cómo Opai procesa los datos de trabajadores y
              clientes del tenant (Ley 21.719).
            </p>
          </div>
        </header>

        {formattedDpaDate ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <Shield className="h-4 w-4" />
              DPA aceptado
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>Fecha de aceptación:</dt>
              <dd className="text-foreground">{formattedDpaDate}</dd>
              <dt>Versión:</dt>
              <dd className="text-foreground">{dpaVersion ?? "—"}</dd>
              {dpaAcceptedBy && (
                <>
                  <dt>Aceptado por:</dt>
                  <dd className="text-foreground font-mono text-[11px]">{dpaAcceptedBy}</dd>
                </>
              )}
            </dl>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
            DPA pendiente de aceptación. Se solicitará al próximo inicio de sesión de un
            owner/admin.
          </div>
        )}

        <a
          href="/dpa"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-xs text-primary hover:underline"
        >
          Ver texto completo del DPA →
        </a>
      </section>
    </div>
  );
}
