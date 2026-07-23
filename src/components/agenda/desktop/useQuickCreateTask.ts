"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { todayInChile } from "@/lib/dates-cl";
import { dateAtChileSlot } from "../agenda-calendar-utils";
import type { AccountOption } from "../nueva-visita/types";

/** Estado + submit de la pestaña Tarea del quick-create (POST /api/crm/tasks). */
export function useQuickCreateTask() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => todayInChile());
  const [time, setTime] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [account, setAccount] = useState<AccountOption | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setTitle("");
    setDate(todayInChile());
    setTime("");
    setAssignedTo("");
    setAccount(null);
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (saving) return false;
    if (!title.trim()) {
      toast.error("Ponle un título a la tarea");
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Fecha de vencimiento inválida");
      return false;
    }
    setSaving(true);
    const allDay = !time;
    const [hh, mm] = (time || "09:00").split(":").map(Number);
    const res = await fetch("/api/crm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        dueAt: dateAtChileSlot(date, hh * 60 + mm).toISOString(),
        allDay,
        assignedTo: assignedTo || undefined,
        accountId: account?.id ?? undefined,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.error("No se pudo crear la tarea");
      return false;
    }
    toast.success("Tarea creada");
    return true;
  }, [saving, title, date, time, assignedTo, account]);

  return {
    form: { title, date, time, assignedTo, account },
    set: { setTitle, setDate, setTime, setAssignedTo, setAccount },
    saving,
    reset,
    submit,
  };
}
