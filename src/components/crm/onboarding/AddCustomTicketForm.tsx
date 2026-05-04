"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type OnboardingStepDraft,
  PRIORITY_OPTIONS,
  TEAM_OPTIONS,
} from "./types";

export function AddCustomTicketForm({
  onAdd,
  ticketTypeOptions,
}: {
  onAdd: (step: OnboardingStepDraft) => void;
  ticketTypeOptions: { slug: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [ticketTypeSlug, setTicketTypeSlug] = useState(
    ticketTypeOptions[0]?.slug ?? "",
  );
  const [team, setTeam] = useState("ops");
  const [priority, setPriority] = useState("p3");
  const [offset, setOffset] = useState(0);
  const [saveToPlaybook, setSaveToPlaybook] = useState(false);

  const reset = () => {
    setTitle("");
    setTicketTypeSlug(ticketTypeOptions[0]?.slug ?? "");
    setTeam("ops");
    setPriority("p3");
    setOffset(0);
    setSaveToPlaybook(false);
  };

  const submit = () => {
    if (!title.trim() || !ticketTypeSlug) return;
    onAdd({
      key: `custom-${Date.now()}`,
      isCustom: true,
      applies: true,
      title: title.trim(),
      ticketTypeSlug,
      assignedTeam: team,
      priority,
      dueDateOffsetDays: offset,
      saveToPlaybook,
      phase: 4,
      sortOrder: 999,
    });
    reset();
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ds-border-default bg-transparent px-3 py-2.5 text-sm text-ds-text-3 transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
      >
        <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
        Agregar ticket personalizado
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-[0.08em] text-ds-text-2">
          Nuevo ticket
        </h5>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="h-6 w-6 text-ds-text-3"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título del ticket"
        className="h-9 text-sm"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          value={ticketTypeSlug}
          onChange={(e) => setTicketTypeSlug(e.target.value)}
          className="col-span-2 rounded-md border border-ds-border-default bg-ds-surface-0 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          {ticketTypeOptions.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="rounded-md border border-ds-border-default bg-ds-surface-0 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          {TEAM_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-md border border-ds-border-default bg-ds-surface-0 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex flex-1 items-center gap-2 text-xs text-ds-text-2">
          <span className="whitespace-nowrap">Offset</span>
          <Input
            type="number"
            value={offset}
            onChange={(e) =>
              setOffset(Number.parseInt(e.target.value, 10) || 0)
            }
            className="h-8 w-20 text-sm"
          />
          <span className="whitespace-nowrap text-ds-text-3">días</span>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-ds-text-2">
        <Checkbox
          checked={saveToPlaybook}
          onCheckedChange={(v) => setSaveToPlaybook(!!v)}
        />
        <span>Guardar en mi plantilla por defecto</span>
      </label>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancelar
        </Button>
        <Button size="sm" onClick={submit} disabled={!title.trim()}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
