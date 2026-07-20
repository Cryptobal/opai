"use client";

import { useEffect, useState } from "react";
import { Surface } from "@/components/opai-ds";

const TYPES = [
  { id: "tecnica", label: "Técnica" },
  { id: "cliente", label: "Cliente" },
  { id: "supervision", label: "Supervisión" },
  { id: "otra", label: "Otra" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  onCreated?: () => void;
};

export function NuevaVisitaModal({
  open,
  onOpenChange,
  dealId,
  accountId: initialAccountId,
  installationId: initialInstallationId,
  onCreated,
}: Props) {
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("cliente");
  const [title, setTitle] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState(initialAccountId ?? "");
  const [installationId, setInstallationId] = useState(initialInstallationId ?? "");
  const [team, setTeam] = useState<Array<{ userId: string; name: string; connected: boolean }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccountId(initialAccountId ?? "");
    setInstallationId(initialInstallationId ?? "");
    fetch("/api/integrations/google-calendar/status")
      .then((r) => r.json())
      .then((j) => {
        const list = j.team ?? [];
        setTeam(list);
        setAssignedUserId((prev) => prev || list[0]?.userId || "");
      })
      .catch(() => undefined);
  }, [open, initialAccountId, initialInstallationId]);

  if (!open) return null;

  const tecnicaBlocked = type === "tecnica" && (!accountId || !installationId);

  async function submit() {
    if (!assignedUserId || !startAt || tecnicaBlocked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agenda/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title || `Visita ${type}`,
          assignedUserId,
          startAt: new Date(startAt).toISOString(),
          notes,
          accountId: accountId || null,
          installationId: installationId || null,
          dealId: dealId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo crear");
        return;
      }
      setToast(`Creada · sync ${json.sync?.syncStatus ?? "PENDING"}`);
      onCreated?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <Surface elevation={2} padding="md" className="w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-semibold text-ds-text-1">Nueva visita</p>
          <button type="button" onClick={() => onOpenChange(false)} className="text-[13px] text-ds-text-3">
            Cerrar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={`h-10 rounded-full px-3 text-[12px] ds-tap sm:h-9 ${
                type === t.id ? "bg-primary text-primary-foreground" : "bg-ds-surface-2 text-ds-text-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tecnicaBlocked && (
          <p className="text-[12px] text-status-warn-fg">
            Visita técnica requiere cuenta e instalación (prefijá desde el negocio).
          </p>
        )}
        <input
          className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="datetime-local"
          className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
        />
        <select
          className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
          value={assignedUserId}
          onChange={(e) => setAssignedUserId(e.target.value)}
        >
          <option value="">Asignado…</option>
          {team.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.name} {u.connected ? "· Calendar ✓" : "· sin Calendar"}
            </option>
          ))}
        </select>
        <textarea
          className="min-h-[72px] w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-[13px]"
          placeholder="Notas"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}
        {toast && <p className="text-[12px] text-status-ok-fg">{toast}</p>}
        <button
          type="button"
          disabled={saving || !assignedUserId || !startAt || tecnicaBlocked}
          onClick={() => void submit()}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary text-[13px] font-medium text-primary-foreground disabled:opacity-50 ds-tap sm:h-9"
        >
          {saving ? "Creando…" : "Crear visita"}
        </button>
      </Surface>
    </div>
  );
}
