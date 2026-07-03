"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";
import {
  expandCatalogDefaults,
  type ChannelPrefs,
} from "@/lib/notifications/channel-types";
import { ModuleAccordion } from "./_components/notif-prefs/ModuleAccordion";
import { PrefsSearchBar } from "./_components/notif-prefs/PrefsSearchBar";

type PrefsMap = Record<string, ChannelPrefs>;
type Channel = keyof ChannelPrefs;

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  cpq: "CPQ",
  ops: "Operaciones",
  docs: "Documentos",
  finance: "Finanzas",
  payroll: "Payroll",
  chat: "Chat",
};

const MODULE_ORDER = ["ops", "crm", "cpq", "docs", "finance", "payroll", "chat"];

interface SlackState {
  workspaceActive: boolean;
  linked: boolean;
}

interface ApiResponse {
  success: boolean;
  data: { preferences: PrefsMap; types: UnifiedNotificationType[]; slack?: SlackState };
}

interface Props {
  highlightType?: string;
}

export function UnifiedNotificationPrefsClient({ highlightType }: Props = {}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<PrefsMap>({});
  const [initialPrefs, setInitialPrefs] = useState<PrefsMap>({});
  const [types, setTypes] = useState<UnifiedNotificationType[]>([]);
  const [slackState, setSlackState] = useState<SlackState>({ workspaceActive: false, linked: false });
  const [query, setQuery] = useState("");
  const [openModules, setOpenModules] = useState<Set<string>>(new Set(["ops", "crm"]));
  const [highlighted, setHighlighted] = useState<string | undefined>(highlightType);
  const highlightRef = useRef<HTMLDivElement>(null);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/preferences");
      const json: ApiResponse = await res.json();
      if (json.success && json.data) {
        setPrefs(json.data.preferences);
        setInitialPrefs(json.data.preferences);
        setTypes(json.data.types);
        if (json.data.slack) setSlackState(json.data.slack);
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

  useEffect(() => {
    if (!highlighted || loading || types.length === 0) return;
    const t = types.find((x) => x.key === highlighted);
    if (!t) return;
    setOpenModules((prev) => new Set([...prev, t.module]));
    const scrollTimer = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    const clearTimer = setTimeout(() => setHighlighted(undefined), 4000);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [highlighted, loading, types]);

  const toggle = useCallback((key: string, channel: Channel, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: { ...p[key], [channel]: value } }));
  }, []);

  const muteModule = useCallback(
    (moduleKey: string) => {
      const moduleTypes = types.filter((t) => t.module === moduleKey);
      setPrefs((p) => {
        const next = { ...p };
        for (const t of moduleTypes) {
          next[t.key] = { bell: false, email: false, pushDesktop: false, pushMobile: false, slack: false };
        }
        return next;
      });
    },
    [types],
  );

  const resetModule = useCallback(
    (moduleKey: string) => {
      const moduleTypes = types.filter((t) => t.module === moduleKey);
      setPrefs((p) => {
        const next = { ...p };
        for (const t of moduleTypes) {
          // Slack personal siempre arranca OFF (opt-in), sin default de catálogo.
          next[t.key] = { ...expandCatalogDefaults(t.defaults.admin ?? {}), slack: false };
        }
        return next;
      });
    },
    [types],
  );

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const t of types) {
      const before = initialPrefs[t.key] ?? {};
      const after = prefs[t.key] ?? {};
      if (
        before.bell !== after.bell ||
        before.email !== after.email ||
        before.pushDesktop !== after.pushDesktop ||
        before.pushMobile !== after.pushMobile ||
        before.slack !== after.slack
      ) {
        n++;
      }
    }
    return n;
  }, [prefs, initialPrefs, types]);

  const handleSave = useCallback(async () => {
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
        setInitialPrefs(prefs);
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const normalizedQuery = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const result = new Map<string, Map<string, UnifiedNotificationType[]>>();
    for (const t of types) {
      const matches =
        !normalizedQuery ||
        t.label.toLowerCase().includes(normalizedQuery) ||
        t.description.toLowerCase().includes(normalizedQuery);
      if (!matches) continue;
      const cats = result.get(t.module) ?? new Map<string, UnifiedNotificationType[]>();
      const list = cats.get(t.category) ?? [];
      list.push(t);
      cats.set(t.category, list);
      result.set(t.module, cats);
    }
    return result;
  }, [types, normalizedQuery]);

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

  const effectiveOpen = normalizedQuery
    ? new Set(MODULE_ORDER.filter((m) => grouped.has(m)))
    : openModules;

  return (
    <div className="space-y-4 max-w-3xl">
      <PrefsSearchBar
        query={query}
        onQueryChange={setQuery}
        saving={saving}
        dirtyCount={dirtyCount}
        onSave={() => void handleSave()}
        showSlack={slackState.workspaceActive}
        slackLinked={slackState.linked}
      />

      {MODULE_ORDER.filter((m) => grouped.has(m)).map((moduleKey) => (
        <ModuleAccordion
          key={moduleKey}
          moduleKey={moduleKey}
          moduleLabel={MODULE_LABELS[moduleKey] ?? moduleKey}
          isOpen={effectiveOpen.has(moduleKey)}
          onToggleOpen={() =>
            setOpenModules((prev) => {
              const next = new Set(prev);
              if (next.has(moduleKey)) {
                next.delete(moduleKey);
              } else {
                next.add(moduleKey);
              }
              return next;
            })
          }
          categories={grouped.get(moduleKey)!}
          prefs={prefs}
          highlighted={highlighted}
          highlightRef={highlightRef}
          onChannelToggle={toggle}
          onMute={() => muteModule(moduleKey)}
          onReset={() => resetModule(moduleKey)}
          slackWorkspaceActive={slackState.workspaceActive}
          slackLinked={slackState.linked}
        />
      ))}

      {dirtyCount > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            className="gap-1.5 shadow-lg"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar {dirtyCount} cambios
          </Button>
        </div>
      )}
    </div>
  );
}
