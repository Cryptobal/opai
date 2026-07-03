"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { McpKey } from "./types";
import { McpCreateKeyForm } from "./McpCreateKeyForm";
import { McpKeyCreatedModal } from "./McpKeyCreatedModal";
import { McpConnectSnippets } from "./McpConnectSnippets";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export function McpConfigClient({ baseUrl }: { baseUrl: string }) {
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<McpKey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/mcp/keys");
      const data = await res.json();
      if (data.success) setKeys(data.keys as McpKey[]);
    } catch {
      toast.error("No se pudieron cargar las keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreated = (plainKey: string) => {
    setShowForm(false);
    setCreatedKey(plainKey);
    void load();
  };

  const doRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/mcp/keys?id=${revoking.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      toast.success("Key revocada");
      setRevoking(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setBusy(false);
    }
  };

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>¿Qué es el servidor MCP?</CardTitle>
          <CardDescription>
            Deja que Claude (claude.ai, Claude Code) opere OPAI con sus ~70 herramientas usando una
            API key. Cada key pertenece a tu usuario y hereda tus permisos. Las de solo lectura no
            pueden crear ni modificar datos.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle>API keys</CardTitle>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nueva key
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {showForm && (
            <McpCreateKeyForm onCreated={onCreated} onCancel={() => setShowForm(false)} />
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay keys. Crea una para conectar tu cliente MCP.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{k.name}</span>
                      <Badge variant={k.scope === "READ_WRITE" ? "warning" : "secondary"}>
                        {k.scope === "READ_WRITE" ? "Lectura y escritura" : "Solo lectura"}
                      </Badge>
                      {k.revokedAt && <Badge variant="destructive">Revocada</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {k.keyPrefix}… · creada {fmtDate(k.createdAt)} · último uso {fmtDate(k.lastUsedAt)}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setRevoking(k)}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" /> Revocar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {active.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conectar</CardTitle>
            <CardDescription>
              Reemplaza <code className="font-mono">TU_API_KEY</code> por la key que copiaste al
              crearla (por seguridad no la guardamos y no se puede volver a mostrar).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <McpConnectSnippets apiKey="TU_API_KEY" baseUrl={baseUrl} />
          </CardContent>
        </Card>
      )}

      <McpKeyCreatedModal
        plainKey={createdKey}
        baseUrl={baseUrl}
        onClose={() => setCreatedKey(null)}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(o) => { if (!o) setRevoking(null); }}
        title="Revocar API key"
        description={`La key "${revoking?.name ?? ""}" dejará de funcionar de inmediato. Esta acción no se puede deshacer.`}
        confirmLabel="Revocar"
        onConfirm={doRevoke}
        loading={busy}
        loadingLabel="Revocando…"
      />
    </div>
  );
}
