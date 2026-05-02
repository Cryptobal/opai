"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Mail, Smartphone, Save, Loader2, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";

type Channel = "bell" | "email" | "push";

interface ChannelPrefs {
  bell?: boolean;
  email?: boolean;
  push?: boolean;
}

type PrefsMap = Record<string, ChannelPrefs>;

interface ApiResponse {
  success: boolean;
  data: {
    preferences: PrefsMap;
    types: UnifiedNotificationType[];
  };
}

interface Props {
  highlightType?: string;
}

export function UnifiedNotificationPrefsClient({ highlightType }: Props = {}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<PrefsMap>({});
  const [types, setTypes] = useState<UnifiedNotificationType[]>([]);
  const [dirty, setDirty] = useState(false);
  const [highlighted, setHighlighted] = useState<string | undefined>(highlightType);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted && !loading && types.length > 0 && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(() => setHighlighted(undefined), 5000);
      return () => clearTimeout(timer);
    }
  }, [highlighted, loading, types.length]);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/preferences");
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

  const toggle = (key: string, channel: Channel, value: boolean) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [channel]: value },
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
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

  const grouped = new Map<string, UnifiedNotificationType[]>();
  for (const t of types) {
    const list = grouped.get(t.category) || [];
    list.push(t);
    grouped.set(t.category, list);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Campana
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" /> Push
          </span>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving || !dirty} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </Button>
      </div>

      {Array.from(grouped.entries()).map(([category, items]) => (
        <section key={category} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold">{category}</h3>
          </div>
          <div className="divide-y divide-border/50">
            {items.map((t) => {
              const def = t.defaults.admin ?? {};
              const pref = prefs[t.key] ?? {};
              const isHighlighted = highlighted === t.key;
              const supportsBell = def.bell !== undefined;
              const supportsEmail = def.email !== undefined;
              const supportsPush = def.push !== undefined;
              return (
                <div
                  key={t.key}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={`flex items-center gap-4 px-5 py-3 transition-colors duration-1000 ${
                    isHighlighted ? "bg-primary/10 ring-2 ring-primary/40 ring-inset rounded-md" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <ChannelToggle
                      icon={<Bell className="h-3.5 w-3.5 text-muted-foreground" />}
                      checked={pref.bell ?? def.bell ?? false}
                      disabled={!supportsBell}
                      onChange={(v) => toggle(t.key, "bell", v)}
                      title="Campana"
                    />
                    <ChannelToggle
                      icon={<Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                      checked={pref.email ?? def.email ?? false}
                      disabled={!supportsEmail}
                      onChange={(v) => toggle(t.key, "email", v)}
                      title="Email"
                    />
                    <ChannelToggle
                      icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
                      checked={pref.push ?? def.push ?? false}
                      disabled={!supportsPush}
                      onChange={(v) => toggle(t.key, "push", v)}
                      title="Push"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5 shadow-lg">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  );
}

function ChannelToggle({
  icon,
  checked,
  disabled,
  onChange,
  title,
}: {
  icon: React.ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  title: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
      title={disabled ? `${title} no aplica para este tipo` : title}
    >
      {icon}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-primary h-4 w-4"
      />
    </label>
  );
}
