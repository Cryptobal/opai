"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Shield, Key, Copy, Send, RefreshCw, Loader2, ToggleLeft, ToggleRight, XCircle, Settings, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_PORTAL_CONFIG, PortalConfig } from "@/lib/portal-cliente-types";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  portalEnabled?: boolean;
  portalPinVisible?: string | null;
  portalInvitationSentAt?: string | null;
  portalLastAccessAt?: string | null;
  portalLastAccessIp?: string | null;
}

interface Props {
  accountId: string;
  contacts: Contact[];
  accountStatus: string;
  accountIsActive: boolean;
  onRefresh: () => void;
}

const MODULE_LABELS: Record<keyof PortalConfig, string> = {
  dashboard: 'Dashboard',
  guardias: 'Guardias',
  liquidaciones: 'Liquidaciones',
  asistencia: 'Asistencia',
  pautas: 'Pautas',
  examenes: 'Exámenes',
  rondas: 'Rondas',
  posta: 'Posta / Bitácora',
  documentacion: 'Documentación',
  cotizaciones: 'Cotizaciones',
  chat_instalacion: 'Chat por instalación',
  chat_grupos: 'Chat grupos',
  tickets: 'Tickets',
  encuestas: 'Encuestas',
  reportes: 'Reportes',
  comparativa: 'Vista comparativa',
  alertas: 'Alertas',
  gamificacion: 'Gamificación',
  conocimiento: 'Conocimiento del equipo',
  canSeeGuardNames: 'Mostrar nombres de guardia (Conocimiento)',
}

export function AccountPortalSection({ accountId, contacts, accountStatus, accountIsActive, onRefresh }: Props) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  /** Optimistic toggle: contactId -> portalEnabled, para que el botón cambie de color al instante */
  const [portalEnabledOverride, setPortalEnabledOverride] = useState<Record<string, boolean>>({});
  const [portalConfig, setPortalConfig] = useState<PortalConfig>(DEFAULT_PORTAL_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/crm/accounts/${accountId}/portal-config`)
      .then(r => r.json())
      .then(data => {
        if (data.portalConfig) setPortalConfig(data.portalConfig);
      })
      .catch(console.error);
  }, [accountId]);

  async function savePortalConfig(newConfig: PortalConfig) {
    setSavingConfig(true);
    try {
      await fetch(`/api/crm/accounts/${accountId}/portal-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalConfig: newConfig }),
      });
    } finally {
      setSavingConfig(false);
    }
  }
  const hasPortalAccess =
    accountStatus === "client_active" ||
    accountStatus === "prospect" ||
    (accountIsActive && accountStatus !== "client_inactive");

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
    setPortalEnabledOverride((prev) => ({ ...prev, [contactId]: enabled }));
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
        setPortalEnabledOverride((prev) => {
          const next = { ...prev };
          delete next[contactId];
          return next;
        });
      } else {
        toast.error(json.error || "Error");
        setPortalEnabledOverride((prev) => {
          const next = { ...prev };
          delete next[contactId];
          return next;
        });
      }
    } catch {
      toast.error("Error de conexión");
      setPortalEnabledOverride((prev) => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
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
        onRefresh();
      } else {
        toast.error(json.error || "Error enviando email");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setContactLoading(contactId, false);
    }
  }, [onRefresh]);

  if (!hasPortalAccess) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Portal del cliente</h3>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-6 text-center">
            <Shield className="h-8 w-8 text-amber-400/40 mx-auto mb-2" />
            <p className="text-sm text-amber-400">
              El portal del cliente está disponible para cuentas con estado &quot;Prospecto&quot; o &quot;Cliente activo&quot;.
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
                const portalEnabled = portalEnabledOverride[c.id] ?? c.portalEnabled;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                      portalEnabled ? "border-border bg-card" : "border-border/40 bg-muted/10",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {c.firstName} {c.lastName}
                        </p>
                        {c.isPrimary && (
                          <Badge className="text-[9px] bg-primary/15 text-primary">Principal</Badge>
                        )}
                        {portalEnabled && (
                          <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400">Portal activo</Badge>
                        )}
                        {hasPin && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-emerald-500/20 text-emerald-400">
                            PIN: {c.portalPinVisible}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.email ?? "Sin email"} {c.phone ? `· ${c.phone}` : ""}
                      </p>
                      {hasPin && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                          {c.portalInvitationSentAt ? (
                            <span title="Invitación enviada">
                              Enviada: {new Date(c.portalInvitationSentAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          ) : (
                            <span className="text-amber-400/80" title="Invitación no enviada">
                              Invitación no enviada
                            </span>
                          )}
                          {c.portalLastAccessAt ? (
                            <span className="text-emerald-400/90" title="Último ingreso al portal">
                              Ingresó: {new Date(c.portalLastAccessAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            <span className="text-amber-400/80" title="Aún no ha ingresado al portal">
                              Nunca ingresó
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                                variant={portalEnabled ? "secondary" : "ghost"}
                                size="sm"
                                className={cn(
                                  "h-7 min-w-[7rem] gap-1",
                                  portalEnabled
                                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30"
                                    : "text-muted-foreground",
                                )}
                                title={portalEnabled ? "Deshabilitar acceso" : "Habilitar acceso"}
                                onClick={() => toggleAccess(c.id, !portalEnabled)}
                              >
                                {portalEnabled ? (
                                  <ToggleRight className="h-3.5 w-3.5" />
                                ) : (
                                  <ToggleLeft className="h-3.5 w-3.5" />
                                )}
                                <span className="text-xs">{portalEnabled ? "Habilitado" : "Deshabilitado"}</span>
                              </Button>
                              {c.email && portalEnabled && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-7 w-7 p-0",
                                    c.portalInvitationSentAt && "text-emerald-400/80",
                                  )}
                                  title={c.portalInvitationSentAt ? "Reenviar invitación" : "Enviar credenciales por email"}
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

          {/* Module visibility section */}
          <div className="border-t border-zinc-800 pt-4 mt-4">
            <button
              type="button"
              onClick={() => setConfigOpen(!configOpen)}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm w-full text-left mb-3"
            >
              <Settings className="h-4 w-4" />
              <span>Módulos visibles en el portal</span>
              <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${configOpen ? 'rotate-180' : ''}`} />
            </button>
            {configOpen && (
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(MODULE_LABELS) as (keyof PortalConfig)[]).map(key => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch
                      id={`module-${key}`}
                      checked={portalConfig[key]}
                      disabled={savingConfig}
                      onCheckedChange={checked => {
                        const updated = { ...portalConfig, [key]: checked };
                        setPortalConfig(updated);
                        savePortalConfig(updated);
                      }}
                    />
                    <label htmlFor={`module-${key}`} className="text-zinc-300 text-sm cursor-pointer select-none">
                      {MODULE_LABELS[key]}
                    </label>
                  </div>
                ))}
              </div>
            )}
            {savingConfig && <p className="text-zinc-500 text-xs mt-2">Guardando...</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
