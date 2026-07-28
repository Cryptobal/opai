"use client";

import { useEffect, useState } from "react";
import { Building2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { IconBubble, Spinner } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { Surface as SurfaceMode } from "@/lib/surface";

const OPTIONS: Array<{
  key: SurfaceMode;
  title: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    key: "productividad",
    title: "Productividad",
    description: "Correos, tareas, agenda y tickets",
    icon: Sparkles,
  },
  {
    key: "erp",
    title: "ERP completo",
    description: "Hub, comercial, operaciones y más",
    icon: Building2,
  },
];

/**
 * Preferencia personal de arranque (login / PWA).
 * Persiste en AdminPreference.landingSurface y cookie opai-surface.
 */
export function LandingSurfaceConfigClient() {
  const [value, setValue] = useState<SurfaceMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/preferences/landing", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { landingSurface?: string | null };
        if (cancelled) return;
        setValue(data.landingSurface === "productividad" ? "productividad" : "erp");
      } catch {
        if (!cancelled) setValue("erp");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (next: SurfaceMode) => {
    if (saving || next === value) return;
    const prev = value;
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch("/api/me/preferences/landing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landingSurface: next }),
      });
      if (!res.ok) {
        setValue(prev);
        toast.error("No se pudo guardar la preferencia");
        return;
      }
      toast.success(
        next === "productividad"
          ? "Al entrar abrirás Productividad"
          : "Al entrar abrirás el ERP",
      );
    } catch {
      setValue(prev);
      toast.error("No se pudo guardar la preferencia");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-24 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ds-text-3">
        Define con qué modo arranca OPAI al iniciar sesión o al abrir la PWA.
        También puedes cambiarlo en el momento con el selector ERP / Productividad
        de la barra.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={saving}
              aria-pressed={active}
              onClick={() => void choose(opt.key)}
              className={cn(
                "flex min-h-14 items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                "disabled:opacity-60",
                active
                  ? "border-primary/50 bg-primary/5"
                  : "border-ds-border-default bg-ds-surface-1 hover:border-primary/40 hover:bg-primary/5",
              )}
            >
              <IconBubble
                icon={opt.icon}
                variant={active ? "brand" : "neutral"}
                size="md"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ds-text-1">
                  {opt.title}
                </span>
                <span className="block text-[12px] text-ds-text-3">
                  {opt.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
