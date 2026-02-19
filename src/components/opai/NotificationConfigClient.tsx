"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Mail, Save, Loader2, AlertTriangle, FileText, FileSignature, Eye, UserPlus, ShieldUser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Prefs = Record<string, unknown>;

interface ToggleRowProps {
  label: string;
  description?: string;
  icon: React.ReactNode;
  bellKey: string;
  emailKey?: string;
  prefs: Prefs;
  onChange: (key: string, value: boolean) => void;
}

function ToggleRow({ label, description, icon, bellKey, emailKey, prefs, onChange }: ToggleRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4 py-3 border-b border-border last:border-0 min-w-0">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="text-xs text-muted-foreground mt-0.5">{description}</div> : null}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Campana">
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="checkbox"
            checked={!!prefs[bellKey]}
            onChange={(e) => onChange(bellKey, e.target.checked)}
            className="accent-primary"
          />
        </label>
        {emailKey ? (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Email">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="checkbox"
              checked={!!prefs[emailKey]}
              onChange={(e) => onChange(emailKey, e.target.checked)}
              className="accent-primary"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

export function NotificationConfigClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/config");
      const json = await res.json();
      if (json.success && json.data) setPrefs(json.data);
    } catch {
      toast.error("No se pudieron cargar las preferencias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPrefs(); }, [fetchPrefs]);

  const handleChange = (key: string, value: boolean | number) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Preferencias guardadas");
        if (json.data) setPrefs(json.data);
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header with legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Bell className="h-3.5 w-3.5" /> = Campana</span>
          <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> = Email a admins</span>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </Button>
      </div>

      {/* Leads */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          Leads
        </h3>
        <ToggleRow
          label="Nuevo lead recibido"
          description="Cuando llega un lead desde el formulario público"
          icon={<UserPlus className="h-4 w-4" />}
          bellKey="newLeadBellEnabled"
          emailKey="newLeadEmailEnabled"
          prefs={prefs}
          onChange={handleChange}
        />
      </section>

      {/* Seguimientos */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Seguimientos automáticos
        </h3>
        <ToggleRow
          label="Seguimiento enviado"
          description="Cuando el cron envía un email de seguimiento automático"
          icon={<Mail className="h-4 w-4" />}
          bellKey="followupBellEnabled"
          emailKey="followupEmailEnabled"
          prefs={prefs}
          onChange={handleChange}
        />
      </section>

      {/* Documentos */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Documentos
        </h3>
        <ToggleRow
          label="Documento por vencer / vencido"
          description="Alerta cuando un contrato está por vencer o ya venció"
          icon={<AlertTriangle className="h-4 w-4" />}
          bellKey="docExpiryBellEnabled"
          emailKey="docExpiryEmailEnabled"
          prefs={prefs}
          onChange={handleChange}
        />
        <div className="flex items-center gap-3 py-3 pl-8">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            Días antes del vencimiento (default para nuevos docs):
          </label>
          <Input
            type="number"
            min={1}
            max={365}
            className="w-20 text-sm"
            value={Number(prefs.docExpiryDaysDefault ?? 30)}
            onChange={(e) => handleChange("docExpiryDaysDefault", Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
          />
        </div>
      </section>

      {/* Ops */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ShieldUser className="h-4 w-4 text-primary" />
          Ops
        </h3>
        <ToggleRow
          label="Documentos de guardias por vencer / vencidos"
          description="Alertas de cédula, OS-10 y otros documentos del guardia en la campanita"
          icon={<AlertTriangle className="h-4 w-4" />}
          bellKey="guardiaDocExpiryBellEnabled"
          prefs={prefs}
          onChange={handleChange}
        />
        <ToggleRow
          label="Nueva postulación recibida"
          description="Cuando alguien envía el formulario de postulación de guardia"
          icon={<ShieldUser className="h-4 w-4" />}
          bellKey="postulacionBellEnabled"
          prefs={prefs}
          onChange={handleChange}
        />
      </section>

      {/* Firma electrónica */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          Firma electrónica
        </h3>
        <ToggleRow
          label="Firma completada"
          description="Cuando todos los firmantes han firmado un documento"
          icon={<FileSignature className="h-4 w-4" />}
          bellKey="signatureCompleteBellEnabled"
          emailKey="signatureCompleteEmailEnabled"
          prefs={prefs}
          onChange={handleChange}
        />
      </section>

      {/* Email tracking */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          Email tracking
        </h3>
        <ToggleRow
          label="Email abierto por destinatario"
          description="Cuando un cliente abre un email enviado desde CRM"
          icon={<Eye className="h-4 w-4" />}
          bellKey="emailOpenedBellEnabled"
          prefs={prefs}
          onChange={handleChange}
        />
      </section>
    </div>
  );
}
