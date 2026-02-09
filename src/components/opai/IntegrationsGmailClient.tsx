/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function IntegrationsGmailClient({
  connected,
}: {
  connected: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const syncEmails = async () => {
    setLoading(true);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/crm/gmail/sync?max=20");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error al sincronizar");
      }
      setSyncMessage(`Sincronizados: ${payload.count}`);
    } catch (error) {
      console.error(error);
      setSyncMessage("No se pudo sincronizar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Gmail</CardTitle>
          <CardDescription>Conecta tu cuenta para enviar y registrar correos.</CardDescription>
        </div>
        <Badge variant="outline">{connected ? "Conectado" : "No conectado"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {connected ? (
          <>
            <p className="text-muted-foreground">
              Tu cuenta Gmail está conectada. Puedes enviar y sincronizar correos.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <a href="/api/crm/gmail/connect">Reconectar Gmail</a>
              </Button>
              <Button variant="outline" size="sm" onClick={syncEmails} disabled={loading}>
                Sincronizar ahora
              </Button>
            </div>
            {syncMessage && (
              <p className="text-xs text-muted-foreground">{syncMessage}</p>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <a href="/api/crm/gmail/connect">Conectar Gmail</a>
            </Button>
            <span className="text-xs text-muted-foreground">
              Requiere permisos Gmail send + readonly.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
