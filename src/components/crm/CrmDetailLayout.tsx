"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { CrmRecordHeader, type CrmRecordHeaderProps } from "./CrmRecordHeader";
import { CRM_SECTIONS, type CrmSectionKey } from "./CrmModuleIcons";
import { type SectionPageType } from "@/lib/use-section-preferences";
import { DetailLayout } from "@/components/opai/DetailLayout";
import { cn } from "@/lib/utils";

/* ── Types ── */

export interface DetailSection {
  /** Key de la sección (debe coincidir con CrmSectionKey) */
  key: CrmSectionKey;
  /** Override del label por defecto */
  label?: string;
  /** Conteo para la nav y el header de sección */
  count?: number;
  /** Acción en el header de la sección (ej: botón "Agregar") */
  action?: ReactNode;
  /** Contenido de la sección */
  children: ReactNode;
  /** Si la sección empieza colapsada (default: abierta) */
  defaultCollapsed?: boolean;
  /** Mantener children montados cuando cerrada (para refs en botones de acción) */
  keepMounted?: boolean;
}

interface CrmDetailLayoutProps extends CrmRecordHeaderProps {
  /** Secciones del detalle (se renderizan en el orden dado) */
  sections: DetailSection[];
  /** Tipo de ficha para persistir preferencias */
  pageType: SectionPageType;
  /** Sección fija (siempre arriba y abierta). Si no se pasa, todas son colapsables */
  fixedSectionKey?: CrmSectionKey | null;
  /** Secciones que empiezan contraídas. true = todas cerradas por defecto */
  defaultCollapsedSectionKeys?: string[] | true;
  /** Clases CSS adicionales al contenedor */
  className?: string;
}

/**
 * CrmDetailLayout — Layout wrapper para páginas de detalle CRM.
 *
 * Orquesta:
 * 1. CrmRecordHeader (sticky, con icono, título, badge, acciones, link "Volver")
 * 2. CrmSectionNav (tabs de anclas sticky con intersection observer)
 * 3. Secciones con CollapsibleSection (cada una con id para anclas)
 *
 * Uso:
 * ```tsx
 * <CrmDetailLayout
 *   module="accounts"
 *   title={account.name}
 *   subtitle="Cliente activo · Seguridad"
 *   badge={{ label: "Activo", variant: "success" }}
 *   backHref="/crm/accounts"
 *   actions={[{ label: "Editar", icon: Pencil, onClick: handleEdit }]}
 *   sections={[
 *     { key: "general", children: <GeneralSection /> },
 *     { key: "contacts", count: 5, children: <ContactsSection /> },
 *   ]}
 * />
 * ```
 */
export function CrmDetailLayout({
  sections,
  pageType,
  fixedSectionKey,
  defaultCollapsedSectionKeys,
  className,
  // RecordHeader props
  module,
  title,
  subtitle,
  badge,
  backHref,
  backLabel,
  actions,
  extra,
}: CrmDetailLayoutProps) {
  const mappedSections = useMemo(
    () =>
      sections.map((section) => {
        const config = CRM_SECTIONS[section.key];
        return {
          key: section.key,
          label: section.label || config.label,
          icon: config.icon,
          count: section.count,
          action: section.action,
          children: section.children,
          keepMounted: section.keepMounted,
        };
      }),
    [sections]
  );

  return (
    <DetailLayout
      pageType={pageType}
      fixedSectionKey={fixedSectionKey}
      defaultCollapsedSectionKeys={defaultCollapsedSectionKeys}
      sections={mappedSections}
      className={cn("-mt-3 sm:-mt-4 lg:-mt-5", className)}
      header={
        <CrmRecordHeader
          module={module}
          title={title}
          subtitle={subtitle}
          badge={badge}
          backHref={backHref}
          backLabel={backLabel}
          actions={actions}
          extra={extra}
        />
      }
    />
  );
}
