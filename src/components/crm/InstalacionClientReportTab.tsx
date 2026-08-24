"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Surface, Spinner, Tag, EmptyState } from "@/components/opai-ds";
import { FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Config = {
  enabled: boolean;
  frequency: "weekly" | "monthly";
  weekday: number;
  dayOfMonth: number;
  sendHourChile: number;
  includeAsistencia: boolean;
  includeCobertura: boolean;
  includeRondas: boolean;
  includeIncidentes: boolean;
  includeVisitas: boolean;
  lastSentAt: string | null;
  lastPeriodKey: string | null;
  canManage: boolean;
  installationName: string;
  accountName: string | null;
};

type Recipients = {
  contacts: Array<{
    contactId: string;
    name: string;
    email: string;
    roleTitle: string | null;
    isPrimary: boolean;
    recibeOperacional: boolean;
    isRecipient: boolean;
  }>;
  extras: Array<{ id: string; email: string; name: string | null }>;
};

const WEEKDAYS = [
  { v: 0, l: "Lunes" },
  { v: 1, l: "Martes" },
  { v: 2, l: "Miércoles" },
  { v: 3, l: "Jueves" },
  { v: 4, l: "Viernes" },
  { v: 5, l: "Sábado" },
  { v: 6, l: "Domingo" },
];

const selectClass =
  "h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]";

export function InstalacionClientReportTab({
  installationId,
}: {
  installationId: string;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [recipients, setRecipients] = useState<Recipients | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extraEmail, setExtraEmail] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const cRes = await fetch(`/api/ops/client-report/config/${installationId}`);
      const cJson = await cRes.json().catch(() => null);
      if (!cRes.ok || !cJson?.success) {
        throw new Error(cJson?.error || "No se pudo cargar la configuración");
      }
      setConfig(cJson.data as Config);

      const rRes = await fetch(
        `/api/ops/client-report/config/${installationId}/recipients`
      );
      const rJson = await rRes.json().catch(() => null);
      if (rJson?.success) setRecipients(rJson.data as Recipients);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  const loadPreview = useCallback(async () => {
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ops/client-report/config/${installationId}/preview`
      );
      if (!res.ok) throw new Error("No se pudo generar la vista previa");
      setPreviewPeriod(res.headers.get("X-Report-Period"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setPreviewing(false);
    }
  }, [installationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const previewReady = Boolean(config);
  useEffect(() => {
    if (!previewReady) return;
    const t = window.setTimeout(() => void loadPreview(), 400);
    return () => window.clearTimeout(t);
  }, [
    previewReady,
    loadPreview,
    config?.frequency,
    config?.includeAsistencia,
    config?.includeCobertura,
    config?.includeRondas,
    config?.includeIncidentes,
    config?.includeVisitas,
  ]);

  async function patch(partial: Partial<Config>) {
    if (!config?.canManage) return;
    setConfig({ ...config, ...partial } as Config);
    const res = await fetch(`/api/ops/client-report/config/${installationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error || "No se pudo guardar");
      void load({ silent: true });
    } else if (partial.enabled) {
      void load({ silent: true });
    }
  }

  async function toggleContact(contactId: string, isRecipient: boolean) {
    setBusy(true);
    try {
      await fetch(`/api/ops/client-report/config/${installationId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "contact", contactId, isRecipient }),
      });
      await load({ silent: true });
    } finally {
      setBusy(false);
    }
  }

  async function addExtra() {
    const email = extraEmail.trim();
    if (!email) return;
    setBusy(true);
    try {
      await fetch(`/api/ops/client-report/config/${installationId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "extra", email, isRecipient: true }),
      });
      setExtraEmail("");
      await load({ silent: true });
    } finally {
      setBusy(false);
    }
  }

  async function removeExtra(email: string) {
    setBusy(true);
    try {
      await fetch(`/api/ops/client-report/config/${installationId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "extra", email, isRecipient: false }),
      });
      await load({ silent: true });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ops/client-report/config/${installationId}/test-send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testEmail.trim() ? { email: testEmail.trim() } : {}),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "No se pudo enviar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !config) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!config) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="No se pudo abrir el reporte"
        description={error || "Inténtalo de nuevo. Si persiste, recarga la ficha."}
        action={
          <Button type="button" className="h-10 sm:h-9" onClick={() => void load()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  const sections: Array<{ key: keyof Config; label: string }> = [
    { key: "includeAsistencia", label: "Asistencia" },
    { key: "includeCobertura", label: "Cobertura" },
    { key: "includeRondas", label: "Rondas" },
    { key: "includeIncidentes", label: "Incidentes QR" },
    { key: "includeVisitas", label: "Visitas de supervisión" },
  ];

  return (
    <div className="space-y-4">
      <Surface padding="md" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-display text-lg">Reporte cliente</h3>
            <p className="text-[13px] text-ds-text-3">
              Informe operativo formal (PDF) que se envía solo, con el logo de GARD Security.
              Revisa la vista previa antes de activarlo.
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={!config.canManage}
              onChange={(e) => void patch({ enabled: e.target.checked })}
            />
            Envío automático
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5 text-[13px]">
            <span className="text-ds-text-3">Frecuencia</span>
            <select
              className={selectClass}
              value={config.frequency}
              disabled={!config.canManage}
              onChange={(e) =>
                void patch({ frequency: e.target.value as Config["frequency"] })
              }
            >
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
            </select>
          </label>
          {config.frequency === "weekly" ? (
            <label className="space-y-1.5 text-[13px]">
              <span className="text-ds-text-3">Día de envío</span>
              <select
                className={selectClass}
                value={config.weekday}
                disabled={!config.canManage}
                onChange={(e) => void patch({ weekday: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.l}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="space-y-1.5 text-[13px]">
              <span className="text-ds-text-3">Día del mes</span>
              <Input
                type="number"
                min={1}
                max={28}
                className="h-10 sm:h-9"
                value={config.dayOfMonth}
                disabled={!config.canManage}
                onChange={(e) => void patch({ dayOfMonth: Number(e.target.value) })}
              />
            </label>
          )}
          <label className="space-y-1.5 text-[13px]">
            <span className="text-ds-text-3">Hora (Chile)</span>
            <Input
              type="number"
              min={0}
              max={23}
              className="h-10 sm:h-9"
              value={config.sendHourChile}
              disabled={!config.canManage}
              onChange={(e) => void patch({ sendHourChile: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          {sections.map((sec) => (
            <label key={sec.key} className="flex min-h-11 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(config[sec.key])}
                disabled={!config.canManage}
                onChange={(e) => void patch({ [sec.key]: e.target.checked })}
              />
              {sec.label}
            </label>
          ))}
        </div>

        {config.lastPeriodKey && (
          <p className="text-[12px] text-ds-text-3">
            Último período enviado: {config.lastPeriodKey}
          </p>
        )}
      </Surface>

      <Surface padding="md" className="space-y-3">
        <h4 className="font-display text-base">Destinatarios</h4>
        {!recipients || (recipients.contacts.length === 0 && recipients.extras.length === 0) ? (
          <p className="text-[13px] text-ds-text-3">
            No hay contactos con email en este cliente. Agrega uno suelto abajo.
          </p>
        ) : (
          <ul className="space-y-1">
            {recipients.contacts.map((c) => (
              <li key={c.contactId}>
                <label className="flex min-h-11 items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={c.isRecipient}
                    disabled={!config.canManage || busy}
                    onChange={(e) => void toggleContact(c.contactId, e.target.checked)}
                  />
                  <span>
                    {c.name} · {c.email}
                    {c.recibeOperacional && (
                      <Tag variant="info" size="sm" className="ml-2">
                        operacional
                      </Tag>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {recipients?.extras.map((e) => (
          <div key={e.id} className="flex min-h-11 items-center justify-between text-[13px]">
            <span>{e.name ? `${e.name} · ` : ""}{e.email}</span>
            {config.canManage && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 sm:h-9"
                onClick={() => void removeExtra(e.email)}
              >
                Quitar
              </Button>
            )}
          </div>
        ))}
        {config.canManage && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="h-10 sm:h-9"
              placeholder="otro@email.cl"
              value={extraEmail}
              onChange={(e) => setExtraEmail(e.target.value)}
            />
            <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={() => void addExtra()}>
              Agregar email
            </Button>
          </div>
        )}
      </Surface>

      <Surface padding="md" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="font-display text-base">Vista previa del envío</h4>
            <p className="text-[13px] text-ds-text-3">
              PDF del período cerrado anterior — el mismo archivo que enviará el cron en segundo plano.
              {previewPeriod ? ` ${previewPeriod}.` : ""}
            </p>
          </div>
          <Button
            type="button"
            className="h-10 sm:h-9"
            disabled={previewing}
            onClick={() => void loadPreview()}
          >
            {previewing ? "Generando…" : "Generar vista previa"}
          </Button>
        </div>
        {previewing && !previewUrl && (
          <div className="flex h-[240px] items-center justify-center">
            <Spinner />
          </div>
        )}
        {previewUrl && (
          <iframe
            title="Vista previa del informe operativo"
            src={previewUrl}
            className="h-[720px] w-full rounded-md border border-ds-border-default bg-white"
          />
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1.5 text-[13px]">
            <span className="text-ds-text-3">Enviar prueba a (opcional)</span>
            <Input
              className="h-10 sm:h-9"
              placeholder="Dejar vacío para usar los destinatarios"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-9"
            disabled={busy || !config.canManage}
            onClick={() => void sendTest()}
          >
            Enviar prueba
          </Button>
        </div>
        {error && <p className="text-[13px] text-status-danger-fg">{error}</p>}
      </Surface>
    </div>
  );
}
