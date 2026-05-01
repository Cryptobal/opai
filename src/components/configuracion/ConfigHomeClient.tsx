"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Users, Plug, PenLine, FolderTree, TrendingUp, Calculator, DollarSign,
  ChevronRight, Bell, Building, ClipboardList, ShieldCheck, Bot,
  ClipboardCheck, Receipt, Ticket, Sparkles, Trophy, Siren, Briefcase,
  Settings, FileText, Shield, Brain, ShieldAlert, GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfigSearch } from "@/components/configuracion/ConfigSearch";
import { ConfigSectionNav } from "@/components/configuracion/ConfigSectionNav";

const ICON_MAP: Record<string, LucideIcon> = {
  building: Building, users: Users, "shield-check": ShieldCheck, plug: Plug,
  bell: Bell, bot: Bot, sparkles: Sparkles, "clipboard-check": ClipboardCheck,
  "file-text": FileText, "pen-line": PenLine, "folder-tree": FolderTree,
  "trending-up": TrendingUp, "dollar-sign": DollarSign, calculator: Calculator,
  "clipboard-list": ClipboardList, ticket: Ticket, receipt: Receipt,
  trophy: Trophy, siren: Siren, briefcase: Briefcase, shield: Shield,
  brain: Brain, "shield-alert": ShieldAlert, "graduation-cap": GraduationCap,
};

type ConfigItem = {
  submodule: string;
  href: string;
  title: string;
  description: string;
  icon: string;
  adminOnly?: boolean;
};

type ConfigSection = {
  key: string;
  title: string;
  items: ConfigItem[];
};

interface ConfigHomeClientProps {
  sections: ConfigSection[];
  isAdmin: boolean;
}

export function ConfigHomeClient({ sections, isAdmin }: ConfigHomeClientProps) {
  const [activeSection, setActiveSection] = useState(sections[0]?.key ?? "");

  const sectionNavItems = useMemo(
    () => sections.map((s) => ({ key: s.key, title: s.title, count: s.items.length })),
    [sections],
  );

  return (
    <div className="space-y-5 min-w-0">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Configuración</h1>
        </div>
        <p className="text-sm text-muted-foreground">Administración global y por módulo</p>
      </div>

      {/* Search (antes no se usaba, ahora sí) */}
      <ConfigSearch />

      {/* Section pills */}
      <ConfigSectionNav sections={sectionNavItems} activeSection={activeSection} onSelect={setActiveSection} />

      {/* Active section */}
      {sections.filter((s) => s.key === activeSection).map((section) => (
        <section key={section.key}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 px-1">{section.title}</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {section.items.map((item, i) => {
              const Icon = ICON_MAP[item.icon] ?? Settings;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/30 active:bg-accent/50 group",
                    i > 0 && "border-t border-border/50",
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight flex items-center gap-2">
                      {item.title}
                      {item.adminOnly && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-status-warn-soft text-status-warn-fg">Admin</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* Other sections (collapsed) */}
      {sections.filter((s) => s.key !== activeSection).map((section) => (
        <section key={section.key} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{section.title}</h2>
            <button onClick={() => setActiveSection(section.key)} className="text-[11px] font-medium text-primary/70 hover:text-primary transition-colors flex items-center gap-1">
              Ver todo<ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {section.items.slice(0, 3).map((item, i) => {
              const Icon = ICON_MAP[item.icon] ?? Settings;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/30 active:bg-accent/50 group",
                    i > 0 && "border-t border-border/50",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary/80">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/25 shrink-0" />
                </Link>
              );
            })}
            {section.items.length > 3 && (
              <button onClick={() => setActiveSection(section.key)} className="w-full py-2.5 text-xs text-primary/60 hover:text-primary border-t border-border/50 transition-colors">
                +{section.items.length - 3} más
              </button>
            )}
          </div>
        </section>
      ))}

      {/* Portal del Guardia */}
      {isAdmin && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1">Portales Externos</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Link href="/portal/guardia" target="_blank" className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/30 active:bg-accent/50 group">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-ok-soft text-status-ok-fg">
                <Shield className="h-[18px] w-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">Portal del Guardia</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">Autoservicio — tickets, pautas, marcaciones y perfil</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <p className="text-[10px] text-muted-foreground px-1">
            Comparte <code className="bg-muted px-1 py-0.5 rounded text-[10px]">/portal/guardia</code> con tus guardias. RUT + PIN.
          </p>
        </section>
      )}
    </div>
  );
}
