"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ROLES } from "@/lib/role-policy";

type ConfigResponse = {
  enabled: boolean;
  allowedRoles: string[];
  allowDataQuestions: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  editor: "Editor",
  rrhh: "RRHH",
  operaciones: "Operaciones",
  reclutamiento: "Reclutamiento",
  solo_ops: "Solo Ops",
  solo_crm: "Solo CRM",
  solo_documentos: "Solo Documentos",
  solo_payroll: "Solo Payroll",
  viewer: "Viewer",
};

const ALL_ROLES = Object.values(ROLES);

export function AiHelpChatConfigClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigResponse>({
    enabled: true,
    allowedRoles: ["owner", "admin", "editor"],
    allowDataQuestions: true,
  });

  const roleSet = useMemo(() => new Set(config.allowedRoles), [config.allowedRoles]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/help-chat/config");
      const json = await res.json();
      if (json.success && json.data) {
        setConfig({
          enabled: Boolean(json.data.enabled),
          allowedRoles: Array.isArray(json.data.allowedRoles)
            ? json.data.allowedRoles
            : ["owner", "admin", "editor"],
          allowDataQuestions: Boolean(json.data.allowDataQuestions),
        });
      }
    } catch {
      toast.error("No se pudo cargar la configuración del asistente");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const toggleRole = (role: string) => {
    setConfig((prev) => {
      const current = new Set(prev.allowedRoles);
      if (current.has(role)) current.delete(role);
      else current.add(role);
      return { ...prev, allowedRoles: [...current] };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/help-chat/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al guardar");
      }
      toast.success("Configuración del asistente guardada");
      if (json.data) {
        setConfig({
          enabled: Boolean(json.data.enabled),
          allowedRoles: Array.isArray(json.data.allowedRoles) ? json.data.allowedRoles : [],
          allowDataQuestions: Boolean(json.data.allowDataQuestions),
        });
      }
    } catch (error) {
      toast.error((error as Error).message || "No se pudo guardar");
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
    <div className="space-y-6 max-w-3xl min-w-0">
      <section className="rounded-xl border border-border bg-card p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Asistente de ayuda funcional</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Responde dudas de uso del sistema y consultas operativas de guardias/métricas sin inferir datos.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={config.enabled}
            onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          Habilitar asistente en la app
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={config.allowDataQuestions}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, allowDataQuestions: e.target.checked }))
            }
          />
          Permitir preguntas de datos operativos (guardias y métricas)
        </label>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3 min-w-0 overflow-hidden">
        <h3 className="text-sm font-semibold">Roles con acceso al chat</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {ALL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={roleSet.has(role)}
                onChange={() => toggleRole(role)}
              />
              {ROLE_LABELS[role] ?? role}
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
