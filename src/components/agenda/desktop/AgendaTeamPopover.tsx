"use client";

import { Check, ChevronDown, UsersRound } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "../agenda-calendar.types";

type Props = {
  users: AgendaTeamMember[];
  /** Ids seleccionados; vacío = todo el equipo. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** userId → tiene Google conectado. `null` = sin datos (usuario no admin). */
  googleByUserId: Map<string, boolean> | null;
  buttonClass: string;
};

/** Multiselect de equipo en Popover con portal (siempre sobre el contenido). */
export function AgendaTeamPopover({
  users,
  selectedIds,
  onChange,
  googleByUserId,
  buttonClass,
}: Props) {
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((v) => v !== id)
        : [...selectedIds, id],
    );

  const label =
    selectedIds.length === 0
      ? "Equipo"
      : selectedIds.length === 1
        ? (users.find((u) => u.id === selectedIds[0])?.name ?? "1 persona")
        : `${selectedIds.length} personas`;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonClass,
          "gap-2",
          selectedIds.length > 0 && "border-primary/40 text-ds-text-1",
        )}
      >
        <span className="flex -space-x-1.5">
          {users.slice(0, 3).map((user, index) => (
            <Avatar
              key={user.id}
              name={user.name}
              size="sm"
              variant={index === 0 ? "brand" : "default"}
              className="h-[22px] w-[22px] text-[12px] ring-2 ring-ds-surface-1"
            />
          ))}
          {users.length === 0 && <UsersRound className="h-4 w-4" />}
        </span>
        <span className="max-w-28 truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-80 w-64 min-w-0 max-w-none space-y-0.5 overflow-y-auto rounded-xl border-ds-border-default bg-ds-surface-1 p-1.5 shadow-ds-lg"
      >
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-ds-text-2 hover:bg-ds-surface-3 ds-tap sm:h-9"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ds-surface-3">
            <UsersRound className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1">Todo el equipo</span>
          {selectedIds.length === 0 && <Check className="h-4 w-4 text-primary" />}
        </button>
        {users.map((user) => {
          const checked = selectedIds.includes(user.id);
          const noGoogle = googleByUserId?.get(user.id) === false;
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => toggle(user.id)}
              className="flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-ds-text-2 hover:bg-ds-surface-3 ds-tap sm:h-9"
            >
              <span
                className={cn(
                  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-ds-border-default bg-ds-surface-1",
                )}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
              <Avatar name={user.name} size="sm" className="h-6 w-6 text-[12px]" />
              <span className="min-w-0 flex-1 truncate">{user.name}</span>
              {noGoogle && (
                <span className="shrink-0 text-[12px] text-ds-text-4">sin Google</span>
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
