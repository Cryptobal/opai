"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2Off, ShieldCheck, ShieldOff } from "lucide-react";

interface LinkedUser {
  id: string;
  slackUserId: string;
  slackEmail: string | null;
  adminName: string;
  adminEmail: string | null;
  linkedAt: string;
}

export function SlackLinkedUsers() {
  const [items, setItems] = useState<LinkedUser[]>([]);
  const [allowWrites, setAllowWrites] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/slack/users");
      const data = await res.json();
      if (data.success) {
        setItems(data.items as LinkedUser[]);
        setAllowWrites(Boolean(data.allowWrites));
      }
    } catch {
      toast.error("No se pudieron cargar los usuarios vinculados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlink = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/integrations/slack/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Usuario desvinculado");
        setItems((prev) => prev.filter((u) => u.id !== id));
      } else {
        toast.error("No se pudo desvincular");
      }
    },
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuarios vinculados</CardTitle>
        <CardDescription>
          Cada usuario de Slack ejecuta el asistente con los permisos de su cuenta OPAI. La
          vinculación es automática por email en el primer contacto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
            allowWrites
              ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {allowWrites ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldOff className="h-4 w-4 shrink-0" />}
          <span>
            Escrituras del asistente:{" "}
            <strong>{allowWrites ? "habilitadas" : "deshabilitadas"}</strong>. Toda escritura desde
            Slack pide confirmación con botones.{" "}
            <a className="underline" href="/opai/configuracion/asistente-ia">
              Configurar asistente IA
            </a>
            .
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay usuarios vinculados. Menciona a <strong>@OPAI</strong> o escríbele por DM para
            iniciar el vínculo.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {items.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.adminName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.adminEmail ?? u.slackEmail ?? u.slackUserId} · Slack {u.slackUserId} ·{" "}
                    {new Date(u.linkedAt).toLocaleDateString("es-CL")}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void unlink(u.id)}>
                  <Link2Off className="mr-1.5 h-4 w-4" /> Desvincular
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
