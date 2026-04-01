"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Copy,
  Trash2,
  Star,
  Plus,
  Loader2,
  Mail,
} from "lucide-react";

interface Template {
  id: string;
  nombre: string;
  asunto: string;
  tipo: string;
  activo: boolean;
  esDefault: boolean;
  updatedAt: string;
  _count?: { envios: number };
}

const TIPO_LABELS: Record<string, string> = {
  ONBOARDING: "Onboarding",
  BIENVENIDA_SITIO: "Bienvenida sitio",
  RECORDATORIO: "Recordatorio",
  GENERAL: "General",
};

const TIPO_VARIANTS: Record<string, "default" | "secondary" | "warning" | "success"> = {
  ONBOARDING: "default",
  BIENVENIDA_SITIO: "success",
  RECORDATORIO: "warning",
  GENERAL: "secondary",
};

export default function TemplatesListClient() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/personas/comunicaciones/templates");
      const json = await res.json();
      if (json.success) setTemplates(json.data);
    } catch (err) {
      console.error("Error fetching templates:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDuplicate = async (t: Template) => {
    try {
      const res = await fetch(`/api/personas/comunicaciones/templates/${t.id}`);
      const json = await res.json();
      if (!json.success) return;

      const original = json.data;
      await fetch("/api/personas/comunicaciones/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: `${original.nombre} (copia)`,
          asunto: original.asunto,
          tipo: original.tipo,
          contenido: original.contenido,
          variables: original.variables,
          esDefault: false,
        }),
      });
      fetchTemplates();
    } catch (err) {
      console.error("Error duplicating:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    try {
      await fetch(`/api/personas/comunicaciones/templates/${id}`, {
        method: "DELETE",
      });
      fetchTemplates();
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await fetch(`/api/personas/comunicaciones/templates/${id}/default`, {
        method: "POST",
      });
      fetchTemplates();
    } catch (err) {
      console.error("Error setting default:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {templates.length} plantilla{templates.length !== 1 ? "s" : ""}
        </p>
        <Button
          onClick={() => router.push("/personas/comunicaciones/plantillas/new")}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva plantilla
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay plantillas aún</p>
          <p className="text-xs mt-1">Crea tu primera plantilla de email</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {templates.map((t) => (
            <Card
              key={t.id}
              className="p-4 flex flex-col gap-3 hover:border-white/10 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold truncate">{t.nombre}</h3>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {t.asunto}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant={TIPO_VARIANTS[t.tipo] ?? "secondary"}>
                    {TIPO_LABELS[t.tipo] ?? t.tipo}
                  </Badge>
                  {t.esDefault && (
                    <Badge variant="success" className="gap-1">
                      <Star className="h-3 w-3" />
                      Default
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Actualizado:{" "}
                {new Date(t.updatedAt).toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>

              <div className="flex items-center gap-1 pt-1 border-t border-white/[0.06]">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    router.push(`/personas/comunicaciones/plantillas/${t.id}`)
                  }
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleDuplicate(t)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Duplicar
                </Button>
                {!t.esDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleSetDefault(t.id)}
                  >
                    <Star className="h-3 w-3 mr-1" />
                    Default
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-red-400"
                  onClick={() => handleDelete(t.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
