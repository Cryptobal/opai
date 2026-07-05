"use client";

import { ChevronDown, RotateCcw, SlidersHorizontal, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";
import { expandCatalogDefaultsForType, type ChannelPrefs } from "@/lib/notifications/channel-types";
import { ChannelToggle } from "./ChannelToggle";
import { CHANNEL_COLS, ColumnHeaderRow, supportsChannel, type Channel } from "./channels";

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
  onToggleColumn: (channel: Channel) => void;
  onOnlyChannel: (channel: Channel) => void;
  slackWorkspaceActive: boolean;
  slackLinked: boolean;
}

export function ModuleAccordion(props: ModuleAccordionProps) {
  const { categories, prefs, highlighted, highlightRef, slackWorkspaceActive, slackLinked } = props;
  const moduleTypes = Array.from(categories.values()).flat();
  const cols = CHANNEL_COLS.filter((c) => !c.slackOnly || slackWorkspaceActive);

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-muted/30 border-b border-border">
        <button
          type="button"
          onClick={props.onToggleOpen}
          className="flex items-center gap-2 text-sm font-semibold flex-1 text-left"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", props.isOpen ? "rotate-0" : "-rotate-90")} />
          {props.moduleLabel}
          <span className="text-xs font-normal text-muted-foreground">({moduleTypes.length})</span>
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={props.onMute} title="Silenciar todos los tipos de este módulo">
            <VolumeX className="h-3.5 w-3.5" />
            Silenciar
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={props.onReset} title="Restablecer valores por defecto">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Dejar solo un canal en este módulo" aria-label="Solo un canal">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Solo este canal</DropdownMenuLabel>
              {cols.map((c) => (
                <DropdownMenuItem
                  key={c.key}
                  disabled={c.key === "slack" && !slackLinked}
                  onClick={() => props.onOnlyChannel(c.key)}
                >
                  {c.icon}
                  <span className="ml-2">Solo {c.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {props.isOpen && (
        <div className="divide-y divide-border/50">
          <ColumnHeaderRow
            cols={cols}
            moduleTypes={moduleTypes}
            prefs={prefs}
            slackLinked={slackLinked}
            tenantSlackActive={slackWorkspaceActive}
            onToggleColumn={props.onToggleColumn}
          />
          {Array.from(categories.entries()).map(([category, list]) => (
            <div key={category}>
              <div className="px-4 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-[0.08em] text-ds-text-4 bg-muted/10">{category}</div>
              {list.map((t) => {
                const def = expandCatalogDefaultsForType(
                  t.key,
                  t.defaults.admin ?? {},
                  slackWorkspaceActive,
                );
                const cur = prefs[t.key] ?? {};
                const isHighlighted = highlighted === t.key;
                const isOverride = (["bell", "email", "pushDesktop", "pushMobile"] as const).some((k) => cur[k] !== def[k]);
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
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Personalizado (difiere del default)" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cols.map((c) => {
                        const supported = supportsChannel(t, c.key, slackLinked, slackWorkspaceActive);
                        return (
                          <ChannelToggle
                            key={c.key}
                            icon={c.icon}
                            checked={supported ? (cur[c.key] ?? def[c.key] ?? false) : false}
                            disabled={!supported}
                            onChange={(v) => props.onChannelToggle(t.key, c.key, v)}
                            label={
                              c.key === "slack"
                                ? slackLinked
                                  ? `${t.label} - Slack (DM directo del bot)`
                                  : "Vincula tu Slack: escríbele un DM al bot OPAI para activar este canal"
                                : `${t.label} - ${c.label}`
                            }
                          />
                        );
                      })}
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
