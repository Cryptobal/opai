"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Mail,
  Save,
  Loader2,
  BellOff,
  MailX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { NotificationTypeDef, UserNotifPrefsMap } from "@/lib/notification-types";

interface ApiResponse {
  success: boolean;
  data: {
    preferences: UserNotifPrefsMap;
    types: NotificationTypeDef[];
  };
}

export function UserNotificationPrefsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<UserNotifPrefsMap>({});
  const [types, setTypes] = useState<NotificationTypeDef[]>([]);
  const [dirty, setDirty] = useState(false);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/user-preferences");
      const json: ApiResponse = await res.json();
      if (json.success && json.data) {
        setPrefs(json.data.preferences);
        setTypes(json.data.types);
      }
    } catch {
      toast.error("No se pudieron cargar las preferencias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  const toggle = (key: string, channel: "bell" | "email", value: boolean) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [channel]: value },
    }));
    setDirty(true);
  };

  const toggleAllBell = (enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev };
      for (const t of types) {
        next[t.key] = { ...next[t.key], bell: enabled };
      }
      return next;
    });
    setDirty(true);
  };

  const toggleAllEmail = (enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev };
      for (const t of types) {
        next[t.key] = { ...next[t.key], email: enabled };
      }
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/user-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Preferencias guardadas");
        setDirty(false);
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <BellOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No hay tipos de notificación disponibles para tu rol.</p>
      </div>
    );
  }

  const grouped = new Map<string, NotificationTypeDef[]>();
  for (const t of types) {
    const list = grouped.get(t.category) || [];
    list.push(t);
    grouped.set(t.category, list);
  }

  const allBellOn = types.every((t) => prefs[t.key]?.bell !== false);
  const allEmailOn = types.every((t) => prefs[t.key]?.email !== false);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Top actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => toggleAllBell(!allBellOn)}
          >
            {allBellOn ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {allBellOn ? "Desactivar todas las campanas" : "Activar todas las campanas"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => toggleAllEmail(!allEmailOn)}
          >
            {allEmailOn ? <MailX className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
            {allEmailOn ? "Desactivar todos los emails" : "Activar todos los emails"}
          </Button>
        </div>
        <Button
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          size="sm"
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" /> Notificación interna (campana)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" /> Notificación por email
        </span>
      </div>

      {/* Groups */}
      {Array.from(grouped.entries()).map(([category, items]) => (
        <section
          key={category}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold">{category}</h3>
          </div>
          <div className="divide-y divide-border/50">
            {items.map((t) => {
              const pref = prefs[t.key] ?? { bell: t.defaultBell, email: t.defaultEmail };
              return (
                <div
                  key={t.key}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer" title="Campana">
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="checkbox"
                        checked={pref.bell}
                        onChange={(e) => toggle(t.key, "bell", e.target.checked)}
                        className="accent-primary h-4 w-4"
                      />
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer" title="Email">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="checkbox"
                        checked={pref.email}
                        onChange={(e) => toggle(t.key, "email", e.target.checked)}
                        className="accent-primary h-4 w-4"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            className="gap-1.5 shadow-lg"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  );
}
