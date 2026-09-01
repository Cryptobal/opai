"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  initialNoticeEmail: string | null;
  initialDailyEmail: string | null;
}

export function FiscalizacionDtConfigClient({ initialNoticeEmail, initialDailyEmail }: Props) {
  const [notice, setNotice] = useState(initialNoticeEmail ?? "");
  const [daily, setDaily] = useState(initialDailyEmail ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/fiscalizacion-dt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dtNoticeEmail: notice.trim(),
          dtDailyReportEmail: daily.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo guardar");
      toast.success("Correos de fiscalización actualizados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-ds-border-default bg-ds-surface-2 p-5">
        <header className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Correos de fiscalización DT</h2>
            <p className="text-[13px] text-ds-text-3">
              Aviso automático al seleccionar este empleador (Art. 24 b) y destinatario del reporte diario (Art. 27 e). El reporte diario no se puede desactivar.
            </p>
          </div>
        </header>
        <div className="space-y-1.5">
          <Label htmlFor="dtNoticeEmail">Correo de aviso de fiscalización</Label>
          <Input
            id="dtNoticeEmail"
            type="email"
            className="h-10 sm:h-9"
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dtDailyReportEmail">Destinatario del reporte diario</Label>
          <Input
            id="dtDailyReportEmail"
            type="email"
            className="h-10 sm:h-9"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            disabled={saving}
          />
        </div>
        <Button onClick={() => void handleSave()} disabled={saving} className="h-10 sm:h-9">
          <Save className="mr-2 h-4 w-4" />
          Guardar
        </Button>
      </section>
    </div>
  );
}
