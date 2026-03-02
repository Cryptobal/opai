"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Key, Copy, Send, RefreshCw, Loader2, ToggleLeft, ToggleRight, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  portalEnabled?: boolean;
  portalPinVisible?: string | null;
  portalLastAccessAt?: string | null;
  portalLastAccessIp?: string | null;
}

interface Props {
  contacts: Contact[];
  accountStatus: string;
  accountIsActive: boolean;
  onRefresh: () => void;
}

export function AccountPortalSection({ contacts, accountStatus, accountIsActive, onRefresh }: Props) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const isClientActive = accountStatus === "client_active" || (accountIsActive && accountStatus !== "client_inactive");

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal/cliente`
    : "/portal/cliente";

  const setContactLoading = (id: string, val: boolean) => setLoading((p) => ({ ...p, [id]: val }));

  const generatePin = useCallback(async (contactId: string) => {
    setContactLoading(contactId, true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_pin" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`PIN generado: ${json.data.pin}`);
        onRefresh();
      } else {
        toast.error(json.error || "Error generando PIN");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setContactLoading(contactId, false);
    }
  }, [onRefresh]);

  const toggleAccess = useCallback(async (contactId: string, enabled: boolean) => {
    setContactLoading(contactId, true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_access", enabled }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(enabled ? "Acceso habilitado" : "Acceso deshabilitado");
        onRefresh();
      } else {
        toast.error(json.error || "Error");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setContactLoading(contactId, false);
    }
  }, [onRefresh]);

  const revokeAccess = useCallback(async (contactId: string) => {
    setContactLoading(contactId, true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Acceso revocado y PIN eliminado");
        onRefresh();
      } else {
        toast.error(json.error || "Error");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setContactLoading(contactId, false);
    }
  }, [onRefresh]);

  const sendEmail = useCallback(async (contactId: string) => {
    setContactLoading(contactId, true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/portal/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Email enviado con credenciales de acceso");
      } else {
        toast.error(json.error || "Error enviando email");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setContactLoading(contactId, false);
    }
  }, []);

  if (!isClientActive) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Portal del cliente</h3>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-6 text-center">
            <Shield className="h-8 w-8 text-amber-400/40 mx-auto mb-2" />
            <p className="text-sm text-amber-400">
              El portal del cliente solo está disponible para cuentas con estado "Cliente activo".
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cambie el estado de la cuenta para habilitar el acceso al portal.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Portal del cliente</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(portalUrl);
              toast.success("URL del portal copiada");
            }}
          >
            <Copy className="h-3 w-3 mr-1" /> Copiar link
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-teal-400" />
            <p className="text-xs text-muted-foreground">
              URL del portal: <span className="text-foreground font-mono text-[11px]">{portalUrl}</span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Los contactos con PIN pueden ingresar al portal usando el RUT de la empresa y su PIN personal.
          </p>

          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay contactos. Agregue contactos en la pestaña "Contactos" primero.
            </p>
          ) : (
            <div className="space-y-2">
              {contacts.map((c) => {
                const isLoading = loading[c.id] ?? false;
                const hasPin = !!c.portalPinVisible;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                      c.portalEnabled ? "border-border bg-card" : "border-border/40 bg-muted/10",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {c.firstName} {c.lastName}
                        </p>
                        {c.isPrimary && (
                          <Badge className="text-[9px] bg-primary/15 text-primary">Principal</Badge>
                        )}
                        {c.portalEnabled && (
                          <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400">Portal activo</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.email ?? "Sin email"} {c.phone ? `· ${c.phone}` : ""}
                      </p>
                      {hasPin && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">PIN:</span>
                          <code className="text-[11px] font-mono bg-muted/30 px-1.5 py-0.5 rounded">
                            {c.portalPinVisible}
                          </code>
                        </div>
                      )}
                      {c.portalLastAccessAt && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Último acceso: {new Date(c.portalLastAccessAt).toLocaleString("es-CL")}
                          {c.portalLastAccessIp ? ` · IP: ${c.portalLastAccessIp}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {!hasPin ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => generatePin(c.id)}
                            >
                              <Key className="h-3 w-3 mr-1" /> Generar PIN
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Regenerar PIN"
                                onClick={() => generatePin(c.id)}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title={c.portalEnabled ? "Deshabilitar acceso" : "Habilitar acceso"}
                                onClick={() => toggleAccess(c.id, !c.portalEnabled)}
                              >
                                {c.portalEnabled ? (
                                  <ToggleRight className="h-4 w-4 text-emerald-400" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                              {c.email && c.portalEnabled && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  title="Enviar credenciales por email"
                                  onClick={() => sendEmail(c.id)}
                                >
                                  <Send className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                                title="Revocar acceso"
                                onClick={() => revokeAccess(c.id)}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
