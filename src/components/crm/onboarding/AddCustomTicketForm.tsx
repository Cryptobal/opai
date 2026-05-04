"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "lucide-react";
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" /> Agregar ticket
      </Button>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-medium">Nuevo ticket custom</h5>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div>
        <Label className="text-xs">Título</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Describe el ticket"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Tipo</Label>
          <select
            value={ticketTypeSlug}
            onChange={(e) => setTicketTypeSlug(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {ticketTypeOptions.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Equipo</Label>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {TEAM_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Prioridad</Label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Offset (días vs inicio)</Label>
          <Input
            type="number"
            value={offset}
            onChange={(e) => setOffset(Number.parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={saveToPlaybook}
          onCheckedChange={(v) => setSaveToPlaybook(!!v)}
        />
        <span>Guardar también en mi plantilla por defecto</span>
      </label>
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={!title.trim()}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
