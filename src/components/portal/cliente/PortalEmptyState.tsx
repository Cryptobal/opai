"use client";

import type { LucideIcon } from "lucide-react";
import { WhatsAppButton } from "./cotizaciones/WhatsAppButton";

interface PortalEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: {
    label: string;
    action: () => void;
  };
  secondaryCta?: {
    label: string;
    action: () => void;
  };
  showWhatsApp?: boolean;
  isProspect?: boolean;
  prospectMessage?: string;
}

export function PortalEmptyState({
  icon: Icon,
  title,
  description,
  cta,
  secondaryCta,
  showWhatsApp,
  isProspect,
  prospectMessage,
}: PortalEmptyStateProps) {
  const message = isProspect && prospectMessage ? prospectMessage : description;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <Icon className="h-12 w-12 text-muted-foreground mb-4" />
      <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
        {message}
      </p>

      {(cta || secondaryCta || showWhatsApp) && (
        <div className="flex flex-col sm:flex-row items-center gap-2 mt-5">
          {cta && (
            <button
              onClick={cta.action}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors"
            >
              {cta.label}
            </button>
          )}
          {secondaryCta && (
            <button
              onClick={secondaryCta.action}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              {secondaryCta.label}
            </button>
          )}
          {showWhatsApp && (
            <WhatsAppButton variant="compact" />
          )}
        </div>
      )}
    </div>
  );
}
