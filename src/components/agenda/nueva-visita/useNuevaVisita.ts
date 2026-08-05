"use client";

import { useCallback, useEffect, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "@/lib/dates-cl";
import type { EventoFormValue, TenantUser } from "../evento/EventoFormFields";
import type { AccountOption, VisitType } from "./types";
import {
  canSubmitVisitaForm,
  defaultScheduleParts,
  endDateFromEndAt,
  missingVisitaSubmitHint,
  normalizeEndDate,
  resolveAssignedUserId,
} from "./visita-form-utils";

export type FormState = {
  type: VisitType;
  title: string;
  label: string;
  allDay: boolean;
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string }>;
  account: AccountOption | null;
  installationId: string;
  /** Dirección de la instalación (solo para el atajo "Usar dirección…"). */
  installationAddress: string;
  installationLat: number | null;
  installationLng: number | null;
  customAddress: string;
  lat: number | null;
  lng: number | null;
  date: string;
  endDate: string;
  time: string;
  durationMin: number;
  assignedUserId: string;
  contactIds: string[];
  notes: string;
  createEvent: boolean;
  inviteContacts: boolean;
  slackReminder: boolean;
};

function localParts(iso: string): { date: string; time: string } {
  const d = toZonedTime(new Date(iso), CHILE_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const emptyForm = (installationId?: string | null): FormState => {
  const schedule = defaultScheduleParts();
  return {
    type: "cliente",
    title: "",
    label: "",
    allDay: false,
    participantIds: [],
    externalEmails: [],
    account: null,
    installationId: installationId ?? "",
    installationAddress: "",
    installationLat: null,
    installationLng: null,
    customAddress: "",
    lat: null,
    lng: null,
    date: schedule.date,
    endDate: schedule.endDate,
    time: schedule.time,
    durationMin: 60,
    assignedUserId: "",
    contactIds: [],
    notes: "",
    createEvent: true,
    inviteContacts: true,
    slackReminder: true,
  };
};

export function formToEventoValue(
  form: FormState,
  dealId?: string | null,
): EventoFormValue {
  return {
    title: form.title,
    label: form.label,
    date: form.date,
    endDate: form.endDate || form.date,
    time: form.time,
    durationMin: form.durationMin,
    allDay: form.allDay,
    // La dirección custom se guarda aunque haya instalación (override).
    address: form.customAddress || null,
    lat: form.lat,
    lng: form.lng,
    notes: form.notes,
    assignedUserId: form.assignedUserId,
    participantIds: form.participantIds,
    externalEmails: form.externalEmails,
    contactIds: form.contactIds,
    syncGoogle: form.createEvent,
    notifyOpai: form.inviteContacts,
    slackReminderPrevDay: form.slackReminder,
    accountId: form.account?.id ?? null,
    accountName: form.account?.name ?? null,
    installationId: form.installationId || null,
    dealId: dealId ?? null,
  };
}

export function eventoPatchToForm(
  patch: Partial<EventoFormValue>,
  form: FormState,
): FormState {
  const next = { ...form };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.label !== undefined) next.label = patch.label;
  if (patch.allDay !== undefined) next.allDay = patch.allDay;
  if (patch.participantIds !== undefined) next.participantIds = patch.participantIds;
  if (patch.externalEmails !== undefined) next.externalEmails = patch.externalEmails;
  if (patch.date !== undefined) {
    next.date = patch.date;
    if (next.allDay && next.endDate < patch.date) next.endDate = patch.date;
  }
  if (patch.endDate !== undefined) next.endDate = patch.endDate || next.date;
  if (patch.time !== undefined) next.time = patch.time;
  if (patch.durationMin !== undefined) next.durationMin = patch.durationMin;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.assignedUserId !== undefined) next.assignedUserId = patch.assignedUserId;
  if (patch.contactIds !== undefined) next.contactIds = patch.contactIds ?? [];
  if (patch.syncGoogle !== undefined) next.createEvent = patch.syncGoogle;
  if (patch.notifyOpai !== undefined) next.inviteContacts = patch.notifyOpai;
  if (patch.slackReminderPrevDay !== undefined) next.slackReminder = patch.slackReminderPrevDay;
  if (patch.accountId !== undefined) {
    if (patch.accountId === null) {
      next.account = null;
    } else if (form.account?.id !== patch.accountId) {
      next.account = {
        id: patch.accountId,
        name: patch.accountName?.trim() || form.account?.name || patch.accountId,
        rut: null,
      };
    } else if (patch.accountName?.trim()) {
      next.account = {
        id: patch.accountId,
        name: patch.accountName.trim(),
        rut: form.account?.rut ?? null,
      };
    }
  }
  if (patch.installationId !== undefined) next.installationId = patch.installationId ?? "";
  if (patch.address !== undefined) next.customAddress = patch.address ?? "";
  if (patch.lat !== undefined) next.lat = patch.lat;
  if (patch.lng !== undefined) next.lng = patch.lng;
  return next;
}

export function useNuevaVisita(props: {
  open: boolean;
  dealId?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  editEventId?: string | null;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const { open, dealId, accountId, installationId, editEventId, onOpenChange, onCreated } =
    props;
  const [form, setForm] = useState<FormState>(emptyForm(installationId));
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const applyEventoPatch = useCallback((patch: Partial<EventoFormValue>) => {
    setForm((f) => eventoPatchToForm(patch, f));
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (!editEventId) {
      setForm(emptyForm(installationId));
    }

    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const id = typeof j?.user?.id === "string" ? j.user.id : "";
        if (!id) return;
        setCurrentUserId(id);
        if (!editEventId) {
          setForm((f) => ({
            ...f,
            assignedUserId: resolveAssignedUserId(f.assignedUserId, id),
          }));
        }
      })
      .catch(() => undefined);

    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((json) => {
        const list: TenantUser[] = (json.data?.users ?? []).map(
          (u: { id: string; name: string; email?: string }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          }),
        );
        setUsers(list);
      })
      .catch(() => undefined);

    fetch("/api/integrations/google-calendar/status")
      .then((r) => r.json())
      .then((j) => {
        const prefs = j.prefs ?? {};
        if (!editEventId) {
          setForm((f) => ({
            ...f,
            inviteContacts: prefs.inviteContacts !== false,
            slackReminder: prefs.slackReminderPrevDay !== false,
          }));
        }
      })
      .catch(() => undefined);

    if (!editEventId && accountId) {
      fetch(`/api/agenda/cuentas?id=${accountId}`)
        .then((r) => r.json())
        .then((j) => setForm((f) => ({ ...f, account: j.items?.[0] ?? null })))
        .catch(() => undefined);
    }

    if (editEventId) {
      setLoading(true);
      fetch(`/api/calendar/events/${editEventId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.visita) return;
          const v = data.visita;
          const parts = localParts(v.startAt);
          const endYmd = endDateFromEndAt(v.endAt);
          const durationMin = Math.max(
            15,
            Math.round(
              (new Date(v.endAt).getTime() - new Date(v.startAt).getTime()) / 60_000,
            ),
          );
          const contactIds = Array.isArray(v.contactIds) ? (v.contactIds as string[]) : [];
          const inst = v.installation as
            | { id?: string; address?: string | null; lat?: number | null; lng?: number | null }
            | null
            | undefined;
          setForm({
            type: (["cliente", "supervision", "otra"].includes(v.type)
              ? v.type
              : "otra") as VisitType,
            title: v.title ?? "",
            label: v.label ?? "",
            allDay: v.allDay === true,
            participantIds: (data.v2?.participants ?? []).map(
              (p: { userId: string }) => p.userId,
            ),
            externalEmails: (data.v2?.externals ?? []).map(
              (e: { email: string; name?: string | null }) => ({
                email: e.email,
                name: e.name ?? undefined,
              }),
            ),
            account: v.account
              ? { id: v.account.id, name: v.account.name, rut: null }
              : null,
            installationId: v.installationId ?? "",
            installationAddress: inst?.address ?? "",
            installationLat: inst?.lat ?? null,
            installationLng: inst?.lng ?? null,
            customAddress: v.customAddress ?? "",
            lat: v.lat ?? null,
            lng: v.lng ?? null,
            date: parts.date,
            endDate: v.allDay ? normalizeEndDate(parts.date, endYmd) : parts.date,
            time: v.allDay ? "" : parts.time,
            durationMin,
            assignedUserId: v.assignedUserId ?? "",
            contactIds,
            notes: v.notes ?? "",
            createEvent: true,
            inviteContacts: true,
            slackReminder: true,
          });
        })
        .catch(() => setError("No se pudo cargar el evento"))
        .finally(() => setLoading(false));
    }
  }, [open, accountId, installationId, editEventId]);

  // Cargar dirección de la instalación seleccionada (atajo + sync fallback).
  useEffect(() => {
    if (!open || !form.installationId) {
      return;
    }
    const id = form.installationId;
    fetch(`/api/crm/installations/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const row = j?.data ?? j?.installation ?? j;
        if (!row || typeof row !== "object") return;
        setForm((f) => {
          if (f.installationId !== id) return f;
          return {
            ...f,
            installationAddress: typeof row.address === "string" ? row.address : "",
            installationLat: typeof row.lat === "number" ? row.lat : null,
            installationLng: typeof row.lng === "number" ? row.lng : null,
          };
        });
      })
      .catch(() => undefined);
  }, [open, form.installationId]);

  const accId = form.account?.id ?? null;
  const canSubmit = canSubmitVisitaForm({
    date: form.date,
    endDate: form.endDate,
    time: form.time,
    allDay: form.allDay,
    loading,
  });
  const submitHint = missingVisitaSubmitHint({
    date: form.date,
    endDate: form.endDate,
    time: form.time,
    allDay: form.allDay,
    loading,
  });

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const assigned = resolveAssignedUserId(form.assignedUserId, currentUserId);
    if (!assigned) {
      setError("No se pudo determinar el responsable del evento");
      setSaving(false);
      return;
    }
    const endDate = normalizeEndDate(form.date, form.endDate);
    const body = {
      type: form.type,
      title: form.title || form.label || "Evento",
      label: form.label || null,
      date: form.date,
      endDate: form.allDay ? endDate : form.date,
      time: form.time || "09:00",
      allDay: form.allDay,
      durationMin: form.durationMin,
      notes: form.notes || null,
      accountId: accId,
      installationId: form.installationId || null,
      customAddress: form.customAddress.trim() || null,
      address: form.customAddress.trim() || null,
      lat: form.lat,
      lng: form.lng,
      dealId: dealId || null,
      contactIds: form.contactIds.length ? form.contactIds : null,
      assignedUserId: assigned,
      participantIds: form.participantIds,
      externalEmails: form.externalEmails,
      syncGoogle: form.createEvent,
      notifyOpai: form.inviteContacts,
      slackReminderPrevDay: form.slackReminder,
    };
    try {
      const res = editEventId
        ? await fetch(`/api/calendar/events/${editEventId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/calendar/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo guardar el evento");
        return;
      }
      const { toast } = await import("sonner");
      const synced = json.syncStatus === "SYNCED";
      toast.success(
        editEventId
          ? synced
            ? "Evento actualizado · Google Calendar actualizado"
            : "Evento actualizado"
          : synced
            ? "Evento agendado · Google Calendar actualizado"
            : "Evento agendado",
      );
      onCreated?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }, [
    canSubmit,
    form,
    accId,
    dealId,
    editEventId,
    currentUserId,
    onCreated,
    onOpenChange,
  ]);

  return {
    form,
    set,
    setForm,
    users,
    currentUserId,
    loading,
    saving,
    error,
    canSubmit,
    submitHint,
    submit,
    applyEventoPatch,
    eventoValue: formToEventoValue(form, dealId),
  };
}
