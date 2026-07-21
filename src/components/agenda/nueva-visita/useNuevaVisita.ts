"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountOption, TeamMember, VisitType } from "./types";

export type FormState = {
  type: VisitType;
  title: string;
  account: AccountOption | null;
  installationId: string;
  customAddress: string;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  durationMin: number;
  assignedUserId: string;
  contactIds: string[];
  notes: string;
  createEvent: boolean;
  inviteContacts: boolean;
  slackReminder: boolean;
};

const emptyForm = (installationId?: string | null): FormState => ({
  type: "cliente",
  title: "",
  account: null,
  installationId: installationId ?? "",
  customAddress: "",
  lat: null,
  lng: null,
  date: "",
  time: "",
  durationMin: 60,
  assignedUserId: "",
  contactIds: [],
  notes: "",
  createEvent: true,
  inviteContacts: true,
  slackReminder: true,
});

export function useNuevaVisita(props: {
  open: boolean;
  dealId?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const { open, dealId, accountId, installationId, onOpenChange, onCreated } = props;
  const [form, setForm] = useState<FormState>(emptyForm(installationId));
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(installationId));
    setError(null);
    // Estado de calendario del equipo + prefs para defaults de toggles.
    fetch("/api/integrations/google-calendar/status")
      .then((r) => r.json())
      .then((j) => {
        const list: TeamMember[] = j.team ?? [];
        const prefs = j.prefs ?? {};
        setTeam(list);
        setForm((f) => ({
          ...f,
          assignedUserId: f.assignedUserId || list[0]?.userId || "",
          inviteContacts: prefs.inviteContacts !== false,
          slackReminder: prefs.slackReminderPrevDay !== false,
        }));
      })
      .catch(() => undefined);
    // Nombre de la cuenta prefijada (para mostrarla bloqueada).
    if (accountId) {
      fetch(`/api/agenda/cuentas?id=${accountId}`)
        .then((r) => r.json())
        .then((j) => setForm((f) => ({ ...f, account: j.items?.[0] ?? null })))
        .catch(() => undefined);
    }
  }, [open, accountId, installationId]);

  const accId = form.account?.id ?? null;
  const tecnicaBlocked = form.type === "tecnica" && (!accId || !form.installationId);
  const canSubmit = Boolean(form.assignedUserId && form.date && form.time) && !tecnicaBlocked;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    const startAt = new Date(`${form.date}T${form.time}`);
    const endAt = new Date(startAt.getTime() + form.durationMin * 60_000);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agenda/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          title: form.title || `Visita ${form.type}`,
          assignedUserId: form.assignedUserId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          notes: form.notes || null,
          accountId: accId,
          installationId: form.installationId || null,
          customAddress: form.installationId ? null : form.customAddress || null,
          lat: form.installationId ? null : form.lat,
          lng: form.installationId ? null : form.lng,
          dealId: dealId || null,
          contactIds: form.contactIds.length ? form.contactIds : null,
          syncCalendar: form.createEvent,
          inviteContacts: form.inviteContacts,
          slackReminderPrevDay: form.slackReminder,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo crear la visita");
        return;
      }
      const status = json.sync?.syncStatus ?? "PENDING";
      const { toast } = await import("sonner");
      toast.success(
        status === "SKIPPED"
          ? "Visita creada (sin evento de calendario)."
          : status === "PENDING"
            ? "Visita creada — se sincronizará cuando el asignado conecte Calendar."
            : "Visita creada y evento de calendario creado.",
      );
      onCreated?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }, [canSubmit, form, accId, dealId, onCreated, onOpenChange]);

  return { form, set, setForm, team, saving, error, tecnicaBlocked, canSubmit, submit };
}
