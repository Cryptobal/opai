"use client";

import { useMemo } from "react";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { Hash, Lock } from "lucide-react";
import type { SlackChannelOption } from "./types";

/** Selector de canal con búsqueda sobre la lista de canales del workspace. */
export function SlackChannelPicker({
  channels,
  value,
  onSelect,
  disabled,
  placeholder = "Elegir canal…",
}: {
  channels: SlackChannelOption[];
  value: string;
  onSelect: (channel: SlackChannelOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const options: SearchableOption[] = useMemo(
    () =>
      channels.map((c) => ({
        id: c.id,
        label: c.name,
        icon: c.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />,
      })),
    [channels],
  );

  return (
    <SearchableSelect
      value={value}
      options={options}
      placeholder={placeholder}
      emptyText="Sin canales"
      disabled={disabled}
      dropdownInPortal
      onChange={(id) => onSelect(channels.find((c) => c.id === id) ?? null)}
    />
  );
}
