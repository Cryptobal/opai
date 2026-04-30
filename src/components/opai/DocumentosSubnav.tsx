"use client";
import { SubNav } from "@/components/opai-ds/SubNav";
import { FileText, FolderOpen, ClipboardCheck, LayoutTemplate } from "lucide-react";

const DOCS_NAV_ITEMS = [
  { href: "/opai/inicio", label: "Presentaciones", icon: FileText },
  { href: "/opai/documentos", label: "Gestión Documental", icon: FolderOpen },
  { href: "/opai/documentos-operativos", label: "Docs Operativos", icon: ClipboardCheck },
  { href: "/opai/documentos/templates", label: "Templates", icon: LayoutTemplate },
];

export function DocumentosSubnav() {
  return <SubNav items={DOCS_NAV_ITEMS} />;
}
