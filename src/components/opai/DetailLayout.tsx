"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw, type LucideIcon } from "lucide-react";
import { CollapsibleSection } from "@/components/crm/CollapsibleSection";
import { useSectionPreferences, type SectionPageType } from "@/lib/use-section-preferences";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionNav, resolveSectionNavLayout, type SectionNavItem } from "./SectionNav";
import { useSearchParams } from "next/navigation";

export interface DetailLayoutSection {
  key: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  keepMounted?: boolean;
}

interface DetailLayoutProps {
  header: ReactNode;
  sections: DetailLayoutSection[];
  pageType: SectionPageType;
  fixedSectionKey?: string | null;
  /** Secciones que empiezan contraídas. true = todas cerradas por defecto */
  defaultCollapsedSectionKeys?: string[] | true;
  className?: string;
}

type SortableSectionItemProps = {
  section: DetailLayoutSection;
  open: boolean;
  locked: boolean;
  onToggle: (nextOpen: boolean) => void;
};

function SortableSectionItem({
  section,
  open,
  locked,
  onToggle,
}: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.key,
    disabled: locked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`section-${section.key}`}
      className={cn("scroll-mt-52", isDragging && "z-20")}
    >
      <CollapsibleSection
        icon={<section.icon className="h-4 w-4" />}
        title={section.label}
        count={section.count}
        action={section.action}
        open={open}
        onToggle={onToggle}
        locked={locked}
        keepMounted={section.keepMounted}
        dragHandle={
          locked ? null : (
            <span
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              role="button"
              aria-label={`Reordenar sección ${section.label}`}
              className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
              onClick={(event) => event.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )
        }
        className={cn(isDragging && "shadow-lg ring-1 ring-primary/25")}
      >
        {section.children}
      </CollapsibleSection>
    </div>
  );
}

export function DetailLayout({
  header,
  sections,
  pageType,
  fixedSectionKey,
  defaultCollapsedSectionKeys,
  className,
}: DetailLayoutProps) {
  const searchParams = useSearchParams();
  const autoOpenedSectionRef = useRef<string | null>(null);
  const sectionByKey = useMemo(
    () => Object.fromEntries(sections.map((section) => [section.key, section])),
    [sections]
  ) as Record<string, DetailLayoutSection>;
  const sectionKeys = useMemo(() => sections.map((section) => section.key), [sections]);
  const hasFixedSection = fixedSectionKey != null && fixedSectionKey !== "";
  const firstSectionKey = hasFixedSection ? fixedSectionKey : "";

  const { orderedKeys, collapsedKeys, openSection, closeSection, reorderSections, resetToDefault } =
    useSectionPreferences({
      pageType,
      fixedSectionKey: hasFixedSection ? fixedSectionKey : undefined,
      sectionKeys,
      defaultCollapsedSectionKeys,
    });

  useEffect(() => {
    const sectionToOpen = searchParams.get("openSection");
    if (!sectionToOpen) return;
    if (!sectionByKey[sectionToOpen]) return;
    if (autoOpenedSectionRef.current === sectionToOpen) return;

    autoOpenedSectionRef.current = sectionToOpen;
    openSection(sectionToOpen);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const sectionEl = document.getElementById(`section-${sectionToOpen}`);
        if (sectionEl) {
          sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }, [searchParams, sectionByKey, openSection]);

  const orderedSections = useMemo(
    () =>
      orderedKeys
        .map((key) => sectionByKey[key])
        .filter((section): section is DetailLayoutSection => Boolean(section)),
    [orderedKeys, sectionByKey]
  );

  const navItems: SectionNavItem[] = orderedSections.map((s) => ({
    key: s.key,
    label: s.label,
    count: s.count,
    icon: s.icon,
  }));

  const sortableKeys = hasFixedSection
    ? orderedSections.map((s) => s.key).filter((key) => key !== firstSectionKey)
    : orderedSections.map((s) => s.key);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeKey = String(active.id);
    const overKey = String(over.id);
    const from = sortableKeys.indexOf(activeKey);
    const to = sortableKeys.indexOf(overKey);
    if (from < 0 || to < 0) return;

    reorderSections(arrayMove(sortableKeys, from, to));
  };

  const resolvedLayout = resolveSectionNavLayout("auto", navItems.length);
  const isVertical = resolvedLayout === "vertical";

  const resetButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-[11px]"
      onClick={resetToDefault}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Restablecer orden
    </Button>
  );

  const sectionsList = (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={orderedSections.map((section) => section.key)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-4 pt-2 sm:space-y-6 sm:pt-3">
          {orderedSections.map((section) => {
            const isFixed = hasFixedSection && section.key === firstSectionKey;
            const isOpen = isFixed ? true : !collapsedKeys.has(section.key);

            return (
              <SortableSectionItem
                key={section.key}
                section={section}
                open={isOpen}
                locked={isFixed}
                onToggle={(nextOpen) =>
                  nextOpen ? openSection(section.key) : closeSection(section.key)
                }
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );

  if (isVertical) {
    return (
      <div className={cn("relative", className)}>
        {header}
        {/* En móvil: columna (nav arriba, contenido abajo). En desktop: fila (nav izquierda, contenido derecha) */}
        <div className="mt-2 flex min-w-0 flex-col gap-2 sm:mt-3 sm:gap-3 lg:mt-4 lg:flex-row">
          <SectionNav
            sections={navItems}
            onSectionClick={(key) => openSection(key)}
            extraAction={resetButton}
          />
          <div className="min-w-0 flex-1 overflow-x-auto">{sectionsList}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {header}

      <SectionNav
        sections={navItems}
        onSectionClick={(key) => openSection(key)}
        extraAction={resetButton}
      />

      <div className="mt-2 sm:mt-3">{sectionsList}</div>
    </div>
  );
}
