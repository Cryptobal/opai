"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { todayInChile } from "@/lib/dates-cl";
import { dateAtChileSlot } from "../agenda-calendar-utils";
import type { AccountOption } from "../nueva-visita/types";
import { hhmmChile } from "./agenda-mobile-utils";

export type ComposerType = "cliente" | "supervision" | "reunion" | "otra";

export type BusyUser = {
  userId: string;
  hasGoogle: boolean;
  busy: Array<{ start: string; end: string; title: string | null }>;
};

export type Availability = {
  users: BusyUser[];
  suggestions: Array<{ start: string; end: string }>;
};

export function useEventComposer(
  open: boolean,
  prefillDate?: string | null,
  dealId?: string | null,
) {
  const [type, setType] = useState<ComposerType>("cliente");
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(() => todayInChile());
  const [time, setTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(60);
  const [allDay, setAllDay] = useState(false);
  const [notes, setNotes] = useState("");
  const [account, setAccount] = useState<AccountOption | null>(null);
  const [installationId, setInstallationId] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [syncGoogle, setSyncGoogle] = useState(true);
  const [notifyOpai, setNotifyOpai] = useState(true);
  const [slackReminder, setSlackReminder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);

  useEffect(() => {
    if (open && prefillDate) setDate(prefillDate);
  }, [open, prefillDate]);

  const startAt = useMemo(() => {
    const [hh, mm] = time.split(":").map(Number);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(hh)) return null;
    return dateAtChileSlot(date, allDay ? 0 : hh * 60 + mm);
  }, [date, time, allDay]);

  useEffect(() => {
    if (!open || !startAt || participantIds.length === 0) {
      setAvailability(null);
      return;
    }
    const from = startAt;
    const to = new Date(startAt.getTime() + Math.max(durationMin, 60) * 60_000);
    const url = `/api/calendar/availability?userIds=${participantIds.join(",")}&from=${from.toISOString()}&to=${new Date(to.getTime() + 10 * 60 * 60_000).toISOString()}&duration=${durationMin}`;
    const timer = setTimeout(() => {
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then(setAvailability)
        .catch(() => setAvailability(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [open, startAt, durationMin, participantIds]);

  const conflicts = useMemo(() => {
    if (!availability || !startAt) return [];
    const end = startAt.getTime() + durationMin * 60_000;
    const out: Array<{ userId: string; label: string }> = [];
    for (const u of availability.users) {
      const hit = u.busy.find(
        (b) => new Date(b.start).getTime() < end && new Date(b.end).getTime() > startAt.getTime(),
      );
      if (hit) {
        out.push({
          userId: u.userId,
          label: `${hit.title ?? "Ocupado"} ${hhmmChile(hit.start)}–${hhmmChile(hit.end)}`,
        });
      }
    }
    return out;
  }, [availability, startAt, durationMin]);

  const applySuggestion = useCallback((iso: string) => {
    const d = new Date(iso);
    const ymd = d.toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
    setDate(ymd);
    setTime(hhmmChile(iso));
    setAllDay(false);
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        title: title.trim() || label.trim() || "Nuevo evento",
        label: label.trim() || null,
        date,
        time,
        allDay,
        durationMin,
        notes: notes || null,
        accountId: account?.id ?? null,
        installationId: installationId || null,
        customAddress: installationId ? null : customAddress || null,
        address: installationId ? null : customAddress || null,
        lat: installationId ? null : lat,
        lng: installationId ? null : lng,
        dealId: dealId ?? null,
        participantIds,
        externalEmails: externalEmails.map((email) => ({ email })),
        syncGoogle,
        notifyOpai,
        slackReminderPrevDay: slackReminder,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.error("No se pudo guardar el evento");
      return false;
    }
    const json = await res.json().catch(() => ({}));
    toast.success(
      json.syncStatus === "SYNCED"
        ? "Evento creado · Google Calendar actualizado"
        : "Evento creado",
    );
    return true;
  }, [
    saving,
    type,
    title,
    label,
    date,
    time,
    allDay,
    durationMin,
    notes,
    account,
    installationId,
    customAddress,
    lat,
    lng,
    dealId,
    participantIds,
    externalEmails,
    syncGoogle,
    notifyOpai,
    slackReminder,
  ]);

  return {
    form: {
      type,
      title,
      label,
      date,
      time,
      durationMin,
      allDay,
      notes,
      account,
      installationId,
      customAddress,
      lat,
      lng,
      participantIds,
      externalEmails,
      syncGoogle,
      notifyOpai,
      slackReminder,
    },
    set: {
      setType,
      setTitle,
      setLabel,
      setDate,
      setTime,
      setDurationMin,
      setAllDay,
      setNotes,
      setAccount,
      setInstallationId,
      setCustomAddress,
      setLat,
      setLng,
      setParticipantIds,
      setExternalEmails,
      setSyncGoogle,
      setNotifyOpai,
      setSlackReminder,
    },
    availability,
    conflicts,
    applySuggestion,
    saving,
    submit,
  };
}
