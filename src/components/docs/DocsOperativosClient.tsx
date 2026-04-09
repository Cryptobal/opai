"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GrillaDocsInstalacion } from "./GrillaDocsInstalacion";
import { GrillaDocsGuardias } from "./GrillaDocsGuardias";

export function DocsOperativosClient() {
  const [tab, setTab] = useState<"instalacion" | "guardia">("instalacion");

  return (
    <div>
      <div className="flex gap-1 mb-4">
        <button
          type="button"
          onClick={() => setTab("instalacion")}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-colors",
            tab === "instalacion"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          Por Instalación
        </button>
        <button
          type="button"
          onClick={() => setTab("guardia")}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-colors",
            tab === "guardia"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          Por Guardia
        </button>
      </div>

      {tab === "instalacion" ? <GrillaDocsInstalacion /> : <GrillaDocsGuardias />}
    </div>
  );
}
