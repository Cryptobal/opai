"use client";

import { SubNav } from "@/components/opai-ds";
import { ClipboardList, CheckCircle2, Layers, Banknote } from "lucide-react";

export function TeSubnav() {
  return (
    <SubNav
      items={[
        { href: "/te/registro", label: "Registro", icon: ClipboardList },
        { href: "/te/aprobaciones", label: "Aprobaciones", icon: CheckCircle2 },
        { href: "/te/lotes", label: "Lotes", icon: Layers },
        { href: "/te/pagos", label: "Pagos", icon: Banknote },
      ]}
    />
  );
}
