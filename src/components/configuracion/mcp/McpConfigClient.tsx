"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, KeyRound, PlugZap, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { isValidMcpKeyFormat } from "@/lib/integrations/mcp/key-format";
import type { McpKey } from "./types";
import { McpCreateKeyForm } from "./McpCreateKeyForm";
import { McpKeyCreatedModal } from "./McpKeyCreatedModal";
import { McpConnectSnippets } from "./McpConnectSnippets";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; count: number }
  | { status: "error"; message: string };

function extractMcpErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    const rpcError = record.error;
    if (rpcError && typeof rpcError === "object") {
      const msg = (rpcError as Record<string, unknown>).message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    if (typeof rpcError === "string" && rpcError.trim()) return rpcError;
  }
  return `Error HTTP ${status}`;
}

export function McpConfigClient({ baseUrl }: { baseUrl: string }) {
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<McpKey | null>(null);
  const [deleting, setDeleting] = useState<McpKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectKey, setConnectKey] = useState("");
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  const trimmedConnectKey = connectKey.trim();
  const isValidKey = useMemo(
    () => isValidMcpKeyFormat(trimmedConnectKey),
    [trimmedConnectKey],
  );

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

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/integrations/mcp/keys?id=${deleting.id}&permanent=true`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      toast.success("Key eliminada");
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  };

  const doTestConnection = async () => {
    if (!isValidKey) return;
    setTestState({ status: "testing" });
    try {
      const res = await fetch(`${baseUrl}/api/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${trimmedConnectKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setTestState({ status: "error", message: extractMcpErrorMessage(res.status, body) });
        return;
      }
      const tools =
        body && typeof body === "object"
          ? (body as { result?: { tools?: unknown } }).result?.tools
          : undefined;
      if (Array.isArray(tools)) {
        setTestState({ status: "ok", count: tools.length });
        return;
      }
      setTestState({ status: "error", message: extractMcpErrorMessage(res.status, body) });
    } catch {
      setTestState({ status: "error", message: "No se pudo conectar con el servidor MCP." });
    }
  };

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>¿Qué es el servidor MCP?</CardTitle>
          <CardDescription>
            Conecta Cursor, Claude Code, claude.ai o Grok Bot a OPAI con ~60 tools de lectura
            (o ~141 con key READ_WRITE y allowWrites). Cada key hereda tus permisos de Admin.
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
                  {!k.revokedAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 shrink-0 text-destructive hover:text-destructive sm:h-8"
                      onClick={() => setRevoking(k)}
                    >
                      <Ban className="mr-1.5 h-4 w-4" /> Revocar
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 shrink-0 text-destructive hover:text-destructive sm:h-8"
                      onClick={() => setDeleting(k)}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" /> Eliminar
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
              Pega tu API key para rellenar los snippets. OPAI no la almacena en claro y no se
              puede volver a mostrar: sin ella los fragmentos son solo referencia y no se pueden
              copiar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mcp-connect-key">Pega tu API key</Label>
              <Input
                id="mcp-connect-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                value={connectKey}
                onChange={(e) => {
                  setConnectKey(e.target.value);
                  setTestState({ status: "idle" });
                }}
                placeholder="opai_mcp_…"
                className="h-11 font-mono sm:h-10"
              />
              {trimmedConnectKey !== "" && !isValidKey && (
                <p className="text-[13px] text-status-warn-fg">
                  {trimmedConnectKey.includes("/api/mcp/")
                    ? "Pega solo la API key, no la URL completa."
                    : "La key debe empezar con opai_mcp_ y tener 40 caracteres después del prefijo."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                disabled={!isValidKey || testState.status === "testing"}
                onClick={() => void doTestConnection()}
                className="h-11 w-full sm:h-10 sm:w-auto"
              >
                <PlugZap className="h-4 w-4" />
                {testState.status === "testing" ? "Probando…" : "Probar conexión"}
              </Button>
              {testState.status === "ok" && (
                <p className="text-[13px] text-status-ok-fg">
                  Conexión correcta. {testState.count} tools disponibles.
                </p>
              )}
              {testState.status === "error" && (
                <p className="text-[13px] text-status-danger-fg">{testState.message}</p>
              )}
            </div>

            <McpConnectSnippets
              apiKey={isValidKey ? trimmedConnectKey : ""}
              baseUrl={baseUrl}
              hasRealKey={isValidKey}
            />
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

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title="Eliminar API key"
        description={`La key "${deleting?.name ?? ""}" ya está revocada y no funciona. Se borrará el registro de forma permanente. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={doDelete}
        loading={busy}
        loadingLabel="Eliminando…"
      />
    </div>
  );
}
