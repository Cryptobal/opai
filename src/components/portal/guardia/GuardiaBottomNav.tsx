"use client";

import {
  Home,
  Ticket,
  CalendarDays,
  User,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Siren,
  UserCheck,
  Fingerprint,
  Clock,
  FileText,
  BookOpen,
  ClipboardCheck,
  BarChart3,
  Package,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { PlatformAwareBottomNav, type NavItem } from "@/components/opai/portal-shell";
import {
  type PortalSection,
  PORTAL_BOTTOM_NAV,
  PORTAL_NAV_ITEMS,
} from "@/lib/guard-portal";

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Ticket,
  CalendarDays,
  User,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Siren,
  UserCheck,
  Fingerprint,
  Clock,
  FileText,
  BookOpen,
  ClipboardCheck,
  BarChart3,
  Package,
  Shield,
};

interface Props {
  activeSection: PortalSection;
  onSelect: (s: PortalSection) => void;
}

export function GuardiaBottomNav({ activeSection, onSelect }: Props) {
  const items: NavItem<PortalSection>[] = PORTAL_BOTTOM_NAV.map((key) => {
    const entry = PORTAL_NAV_ITEMS.find((n) => n.key === key);
    return {
      id: key,
      label: entry?.label ?? key,
      icon: (entry && ICON_MAP[entry.icon]) ?? Home,
    };
  });

  const activeId: PortalSection = PORTAL_BOTTOM_NAV.includes(activeSection)
    ? activeSection
    : "inicio";

  return <PlatformAwareBottomNav items={items} activeId={activeId} onSelect={onSelect} />;
}
