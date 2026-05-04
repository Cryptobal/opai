"use client";

import { Bell, ChevronDown, Mail, Monitor, RotateCcw, Smartphone, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";
import { expandCatalogDefaults, type ChannelPrefs } from "@/lib/notifications/channel-types";
import { ChannelToggle } from "./ChannelToggle";

type Channel = keyof ChannelPrefs;

interface ModuleAccordionProps {
  moduleKey: string;
  moduleLabel: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  categories: Map<string, UnifiedNotificationType[]>;
  prefs: Record<string, ChannelPrefs>;
  highlighted?: string;
  highlightRef: React.RefObject<HTMLDivElement | null>;
  onChannelToggle: (key: string, channel: Channel, value: boolean) => void;
  onMute: () => void;
  onReset: () => void;
}

export function ModuleAccordion({
  moduleKey,
  moduleLabel,
  isOpen,
  onToggleOpen,
  categories,
  prefs,
  highlighted,
  highlightRef,
  onChannelToggle,
  onMute,
  onReset,
}: ModuleAccordionProps) {
  const totalTypes = Array.from(categories.values()).reduce((acc, arr) => acc + arr.length, 0);

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-muted/30 border-b border-border">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-2 text-sm font-semibold flex-1 text-left"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", isOpen ? "rotate-0" : "-rotate-90")}
          />
          {moduleLabel}
          <span className="text-xs font-normal text-muted-foreground">({totalTypes})</span>
        </button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onMute}
            title="Silenciar todos los tipos de este módulo"
          >
            <VolumeX className="h-3.5 w-3.5" />
            Silenciar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onReset}
            title="Restablecer valores por defecto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </header>

      {isOpen && (
        <div className="divide-y divide-border/50">
          {Array.from(categories.entries()).map(([category, list]) => (
            <div key={category}>
              <div className="px-4 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-[0.08em] text-ds-text-4 bg-muted/10">
                {category}
              </div>
              {list.map((t) => {
                const def = expandCatalogDefaults(t.defaults.admin ?? {});
                const cur = prefs[t.key] ?? {};
                const isHighlighted = highlighted === t.key;
                const isOverride =
                  cur.bell !== def.bell ||
                  cur.email !== def.email ||
                  cur.pushDesktop !== def.pushDesktop ||
                  cur.pushMobile !== def.pushMobile;

                const supports = {
                  bell: def.bell !== undefined,
                  email: def.email !== undefined,
                  pushDesktop: def.pushDesktop !== undefined,
                  pushMobile: def.pushMobile !== undefined,
                };

                return (
                  <div
                    key={t.key}
                    ref={isHighlighted ? highlightRef : undefined}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 transition-colors",
                      isHighlighted && "bg-primary/10 ring-2 ring-primary/40 ring-inset",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{t.label}</span>
                        {isOverride && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
                            title="Personalizado (difiere del default)"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {t.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ChannelToggle
                        icon={<Bell className="h-3.5 w-3.5" />}
                        checked={cur.bell ?? def.bell ?? false}
                        disabled={!supports.bell}
                        onChange={(v) => onChannelToggle(t.key, "bell", v)}
                        label={`${t.label} - Campana`}
                      />
                      <ChannelToggle
                        icon={<Mail className="h-3.5 w-3.5" />}
                        checked={cur.email ?? def.email ?? false}
                        disabled={!supports.email}
                        onChange={(v) => onChannelToggle(t.key, "email", v)}
                        label={`${t.label} - Email`}
                      />
                      <ChannelToggle
                        icon={<Monitor className="h-3.5 w-3.5" />}
                        checked={cur.pushDesktop ?? def.pushDesktop ?? false}
                        disabled={!supports.pushDesktop}
                        onChange={(v) => onChannelToggle(t.key, "pushDesktop", v)}
                        label={`${t.label} - Push escritorio`}
                      />
                      <ChannelToggle
                        icon={<Smartphone className="h-3.5 w-3.5" />}
                        checked={cur.pushMobile ?? def.pushMobile ?? false}
                        disabled={!supports.pushMobile}
                        onChange={(v) => onChannelToggle(t.key, "pushMobile", v)}
                        label={`${t.label} - Push móvil`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
