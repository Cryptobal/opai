"use client";

import {
  FileText,
  Pencil,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Choice = "manual" | "ai" | "pdf";

type Props = {
  aiAvailable: boolean | null;
  onChoose: (choice: Choice) => void;
};

type CardSpec = {
  id: Choice;
  icon: LucideIcon;
  title: string;
  description: string;
  needsAi: boolean;
  accent: string;
  badge?: string;
};

const CARDS: CardSpec[] = [
  {
    id: "manual",
    icon: Pencil,
    title: "Manual",
    description: "Crea secciones e ítems desde cero, uno a uno.",
    needsAi: false,
    accent: "text-sky-300",
  },
  {
    id: "ai",
    icon: Sparkles,
    title: "Generar con IA",
    description: "Genera un protocolo completo según el tipo de instalación.",
    needsAi: true,
    accent: "text-emerald-300",
    badge: "Recomendado",
  },
  {
    id: "pdf",
    icon: FileText,
    title: "Desde PDF",
    description: "Extrae el protocolo desde un documento existente.",
    needsAi: true,
    accent: "text-amber-300",
  },
];

export function ProtocolWizardEmpty({ aiAvailable, onChoose }: Props) {
  return (
    <section className="relative overflow-hidden">
      {/* halo decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:py-14 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur">
          <Shield className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mt-4 font-display text-xl sm:text-2xl font-semibold text-foreground">
          Crear Protocolo de Seguridad
        </h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Define las secciones, ítems y procedimientos que componen el protocolo
          operativo de esta instalación.
        </p>

        <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {CARDS.map((card) => {
            const Icon = card.icon;
            const disabled = card.needsAi && aiAvailable === false;
            return (
              <button
                key={card.id}
                type="button"
                disabled={disabled}
                className="group relative flex flex-col items-start text-left rounded-2xl border border-border/60 bg-card/40 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                onClick={() => onChoose(card.id)}
              >
                {card.badge && card.id === "ai" && aiAvailable && (
                  <span className="absolute right-3 top-3 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    {card.badge}
                  </span>
                )}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/60 ${card.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-sm font-semibold text-foreground">
                  {card.title}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {card.description}
                </div>
                {card.needsAi && aiAvailable === false && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    <Sparkles className="h-2.5 w-2.5" />
                    IA no configurada
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
