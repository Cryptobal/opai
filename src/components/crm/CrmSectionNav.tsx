"use client";

import type { ReactNode } from "react";
import { SectionNav } from "@/components/opai/SectionNav";
import { CRM_SECTIONS, type CrmSectionKey } from "./CrmModuleIcons";

export interface SectionNavItem {
  key: CrmSectionKey;
  label?: string;
  count?: number;
}

interface CrmSectionNavProps {
  sections: SectionNavItem[];
  className?: string;
  onSectionClick?: (key: CrmSectionKey) => void;
  extraAction?: ReactNode;
}

export function CrmSectionNav({
  sections,
  className,
  onSectionClick,
  extraAction,
}: CrmSectionNavProps) {
  return (
    <SectionNav
      className={className}
      sections={sections.map((section) => {
        const config = CRM_SECTIONS[section.key];
        return {
          key: section.key,
          label: section.label || config.label,
          icon: config.icon,
          count: section.count,
        };
      })}
      onSectionClick={(key) => onSectionClick?.(key as CrmSectionKey)}
      extraAction={extraAction}
    />
  );
}
