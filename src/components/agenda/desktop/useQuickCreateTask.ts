"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { todayInChile } from "@/lib/dates-cl";
import {
  DEFAULT_MINUTE,
  dueFromYmd,
  type DueValue,
} from "@/components/tareas/TareaDatePopover";
import type { AccountOption } from "../nueva-visita/types";

/** Estado + submit de la pestaña Tarea del quick-create (POST /api/crm/tasks). */
export function useQuickCreateTask() {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState<DueValue>(() =>
    dueFromYmd(todayInChile(), DEFAULT_MINUTE, true),
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [account, setAccount] = useState<AccountOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const setDate = useCallback((ymd: string) => {
    setDue((current) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return current;
      if (current.allDay || !current.dueAt) {
        return dueFromYmd(ymd, DEFAULT_MINUTE, true);
      }
      const hhmm = new Date(current.dueAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Santiago",
      });
      const m = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      return dueFromYmd(ymd, m, false);
    });
  }, []);

  const setTime = useCallback((hhmm: string) => {
    setDue((current) => {
      const ymd = current.dueAt
        ? new Date(current.dueAt).toLocaleDateString("en-CA", {
            timeZone: "America/Santiago",
          })
        : todayInChile();
      if (!hhmm) return dueFromYmd(ymd, DEFAULT_MINUTE, true);
      const m = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      return dueFromYmd(ymd, m, false);
    });
  }, []);

  const reset = useCallback(() => {
    setTitle("");
    setNotes("");
    setDue(dueFromYmd(todayInChile(), DEFAULT_MINUTE, true));
    setAssigneeIds([]);
    setAccount(null);
    setCreatedId(null);
  }, []);

  const submit = useCallback(async (): Promise<string | null> => {
    if (saving) return null;
    if (!title.trim()) {
      toast.error("Ponle un título a la tarea");
      return null;
    }
    setSaving(true);
    const res = await fetch("/api/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        notes: notes.trim() || undefined,
        dueAt: due.dueAt,
        allDay: due.allDay,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
        accountId: account?.id ?? undefined,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.error("No se pudo crear la tarea");
      return null;
    }
    const json = await res.json().catch(() => null);
    const id = typeof json?.data?.id === "string" ? json.data.id : null;
    setCreatedId(id);
    toast.success("Tarea creada");
    return id;
  }, [saving, title, notes, due, assigneeIds, account]);

  // Compat: form.date / form.time para prefill desde slot.
  const formDate = due.dueAt
    ? new Date(due.dueAt).toLocaleDateString("en-CA", { timeZone: "America/Santiago" })
    : todayInChile();
  const formTime =
    due.dueAt && !due.allDay
      ? new Date(due.dueAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "America/Santiago",
        })
      : "";

  return {
    form: {
      title,
      notes,
      due,
      date: formDate,
      time: formTime,
      assigneeIds,
      account,
      createdId,
    },
    set: {
      setTitle,
      setNotes,
      setDue,
      setDate,
      setTime,
      setAssigneeIds,
      setAccount,
    },
    saving,
    reset,
    submit,
  };
}
