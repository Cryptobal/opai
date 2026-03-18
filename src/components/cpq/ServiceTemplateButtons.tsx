"use client";

import { cn } from "@/lib/utils";
import { SERVICE_TEMPLATES, type ServiceTemplate } from "@/lib/cpq/service-templates";
import { ShieldCheck, Sun, Moon, Calendar } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldCheck,
  Sun,
  Moon,
  Calendar,
};

interface ServiceTemplateButtonsProps {
  onSelect: (template: ServiceTemplate) => void;
  selectedTemplateId?: string;
  compact?: boolean;
  existingPositionsCount?: number;
}

export function ServiceTemplateButtons({
  onSelect,
  selectedTemplateId,
  compact,
  existingPositionsCount,
}: ServiceTemplateButtonsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Plantillas rápidas</p>
        {existingPositionsCount != null && existingPositionsCount > 0 && (
          <p className="text-[10px] text-amber-600">
            Reemplazará {existingPositionsCount} puesto(s) existente(s)
          </p>
        )}
      </div>
      <div className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4")}>
        {SERVICE_TEMPLATES.map((template) => {
          const Icon = ICON_MAP[template.icon] || ShieldCheck;
          const isSelected = selectedTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/50",
                isSelected && "border-primary bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium leading-tight">
                  {compact ? template.shortLabel : template.label}
                </span>
              </div>
              {!compact && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {template.description}
                </p>
              )}
              <span className="text-[10px] text-muted-foreground">
                {template.totalGuards} guardias · {template.positions.length} puesto(s)
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
