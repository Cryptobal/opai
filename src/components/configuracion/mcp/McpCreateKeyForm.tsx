"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { McpScope } from "./types";

export function McpCreateKeyForm({
  onCreated,
  onCancel,
}: {
  onCreated: (plainKey: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<McpScope>("READ");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Ponle un nombre a la key");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/mcp/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error");
      onCreated(data.plainKey);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1">
        <Label htmlFor="mcp-key-name">Nombre</Label>
        <Input
          id="mcp-key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Claude de Carlos"
          maxLength={80}
        />
      </div>

      <div className="space-y-1">
        <Label>Permisos</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={scope === "READ" ? "default" : "outline"}
            onClick={() => setScope("READ")}
          >
            Solo lectura
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "READ_WRITE" ? "default" : "outline"}
            onClick={() => setScope("READ_WRITE")}
          >
            Lectura y escritura
          </Button>
        </div>
      </div>

      {scope === "READ_WRITE" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ Esta key podrá <strong>crear y modificar</strong> datos (leads, cotizaciones,
          facturas…) con los permisos de tu usuario. Compártela solo con clientes MCP de confianza.
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Creando…" : "Crear key"}
        </Button>
      </div>
    </form>
  );
}
