"use client";

import { SectionHeader, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

type TeamRow = { userId: string; name: string; email: string; connected: boolean };

export function CalendarTeamList({
  team,
  copied,
  onInvite,
}: {
  team: TeamRow[];
  copied: boolean;
  onInvite: () => void;
}) {
  if (team.length === 0) return null;
  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <SectionHeader title="Equipo" hint="Quién tiene Calendar conectado" />
      <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
        {team.map((u) => (
          <li key={u.userId} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ds-text-1">{u.name}</p>
              <p className="truncate text-[12px] text-ds-text-4">{u.email}</p>
            </div>
            {u.connected ? (
              <Tag variant="ok" size="sm">
                Conectado
              </Tag>
            ) : (
              <Button variant="outline" size="sm" onClick={onInvite}>
                {copied ? "Link copiado" : "Invitar"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
