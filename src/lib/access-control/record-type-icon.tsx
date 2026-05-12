"use client";

import React from "react";
import {
  UserPlus,
  Truck,
  Car,
  BadgeCheck,
  Package,
  Users,
  Briefcase,
  ShieldCheck,
  ClipboardList,
  Wrench,
  Bike,
  Bus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccessRecordType } from "./types";
import { getRecordTypeIconName, AVAILABLE_RECORD_TYPE_ICONS } from "./types";

const ICON_MAP: Record<string, LucideIcon> = {
  UserPlus,
  Truck,
  Car,
  BadgeCheck,
  Package,
  Users,
  Briefcase,
  ShieldCheck,
  ClipboardList,
  Wrench,
  Bike,
  Bus,
};

/** Get the lucide component for an icon name. Unknown names fall back to
 *  UserPlus rather than crashing the render. */
export function getLucideIconByName(name: string): LucideIcon {
  return ICON_MAP[name] ?? UserPlus;
}

interface RecordTypeIconProps {
  type: AccessRecordType;
  config?: { recordTypeIcons?: Partial<Record<AccessRecordType, string>> } | null;
  className?: string;
}

/** Render the icon (possibly customized per-installation) for a record type. */
export function RecordTypeIcon({ type, config, className }: RecordTypeIconProps) {
  const iconName = getRecordTypeIconName(type, config);
  const Icon = getLucideIconByName(iconName);
  return <Icon className={className} />;
}

export { AVAILABLE_RECORD_TYPE_ICONS };
