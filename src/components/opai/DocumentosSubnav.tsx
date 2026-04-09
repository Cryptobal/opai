"use client";
import { SubNav } from "@/components/opai/SubNav";
import { FileText, FolderOpen, ClipboardCheck } from "lucide-react";

const DOCS_NAV_ITEMS = [
  { href: "/opai/inicio", label: "Presentaciones", icon: FileText },
  { href: "/opai/documentos", label: "Gestión Documental", icon: FolderOpen },
  { href: "/opai/documentos-operativos", label: "Docs Operativos", icon: ClipboardCheck },
];

export function DocumentosSubnav() {
  return <SubNav items={DOCS_NAV_ITEMS} />;
}
