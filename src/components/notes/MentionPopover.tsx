"use client";

import { AtSign, Users } from "lucide-react";
import type { MentionOption } from "@/types/notes";
import { getInitials } from "./note-helpers";

interface GroupedOptions {
  special: (Extract<MentionOption, { kind: "special" }>)[];
  groups: (Extract<MentionOption, { kind: "group" }>)[];
  users: (Extract<MentionOption, { kind: "user" }>)[];
  all: MentionOption[];
}

interface MentionPopoverProps {
  visible: boolean;
  options: GroupedOptions;
  selectedIdx: number;
  onSelect: (option: MentionOption) => void;
}

export function MentionPopover({
  visible,
  options,
  selectedIdx,
  onSelect,
}: MentionPopoverProps) {
  if (!visible || options.all.length === 0) return null;

  let optionCursor = 0;

  const renderOption = (option: MentionOption) => {
    const idx = optionCursor++;
    const isSelected = idx === selectedIdx;

    if (option.kind === "special") {
      return (
        <button
          key={`special-${option.id}`}
          type="button"
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            isSelected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(option);
          }}
          onClick={() => onSelect(option)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <AtSign className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-xs">@{option.label}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              Notificar a todos los usuarios activos
            </p>
          </div>
        </button>
      );
    }

    if (option.kind === "group") {
      return (
        <button
          key={`group-${option.id}`}
          type="button"
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            isSelected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(option);
          }}
          onClick={() => onSelect(option)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500 shrink-0">
            <Users className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-xs">{option.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {option.memberCount} miembro(s)
            </p>
          </div>
        </button>
      );
    }

    return (
      <button
        key={`user-${option.id}`}
        type="button"
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(option);
        }}
        onClick={() => onSelect(option)}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary shrink-0">
          {getInitials(option.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-xs">{option.name}</p>
          {option.email && (
            <p className="truncate text-[10px] text-muted-foreground">
              {option.email}
            </p>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="absolute z-[100] top-full mt-1 left-0 w-72 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
      {options.special.length > 0 && (
        <div>
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Especial
          </p>
          {options.special.map((o) => renderOption(o))}
        </div>
      )}
      {options.groups.length > 0 && (
        <div>
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Grupos
          </p>
          {options.groups.map((o) => renderOption(o))}
        </div>
      )}
      {options.users.length > 0 && (
        <div>
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Usuarios
          </p>
          {options.users.map((o) => renderOption(o))}
        </div>
      )}
    </div>
  );
}
