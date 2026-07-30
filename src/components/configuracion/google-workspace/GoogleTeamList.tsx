"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionHeader, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

export type GoogleTeamRow = {
  userId: string;
  name: string;
  email: string;
  connected: boolean;
  googleEmail?: string | null;
};

/**
 * Lista de equipo compartida (Gmail / Calendar): muestra quién está conectado
 * y permite invitar por mail a conectar Gmail, Drive y Calendar.
 */
export function GoogleTeamList({
  team,
  title = "Equipo",
  hint = "Quién tiene la integración conectada",
}: {
  team: GoogleTeamRow[];
  title?: string;
  hint?: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (team.length === 0) return null;

  async function invite(userId: string) {
    setBusyId(userId);
    try {
      const res = await fetch("/api/integrations/google-workspace/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        email?: string;
      } | null;
      if (!res.ok) {
        toast.error(data?.error || "No se pudo enviar la invitación");
        return;
      }
      toast.success(`Invitación enviada a ${data?.email ?? "el usuario"}`);
    } catch {
      toast.error("No se pudo enviar la invitación");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <SectionHeader title={title} hint={hint} />
      <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
        {team.map((u) => (
          <li
            key={u.userId}
            className="flex items-center justify-between gap-2 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-ds-body font-medium text-ds-text-1">
                {u.name}
              </p>
              <p className="truncate text-[12px] text-ds-text-4">
                {u.connected && u.googleEmail && u.googleEmail !== u.email
                  ? `${u.email} · ${u.googleEmail}`
                  : u.email}
              </p>
            </div>
            {u.connected ? (
              <Tag variant="ok" size="sm">
                Conectado
              </Tag>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9"
                disabled={busyId === u.userId}
                onClick={() => void invite(u.userId)}
              >
                {busyId === u.userId ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Invitar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
