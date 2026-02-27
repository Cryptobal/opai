/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Industry = {
  id: string;
  name: string;
  order: number;
  active: boolean;
};

export function CrmIndustriasTab() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [newIndustryName, setNewIndustryName] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  useEffect(() => {
    fetch("/api/crm/industries")
      .then((r) => r.json())
      .then((res) => res.success && setIndustries(res.data || []))
      .catch(() => {});
  }, []);

  const addIndustry = async () => {
    if (!newIndustryName.trim()) {
      toast.error("Escribe el nombre de la industria.");
      return;
    }
    setLoadingId("new-industry");
    try {
      const res = await fetch("/api/crm/industries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newIndustryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al crear");
      setIndustries((prev) => [...prev, data.data]);
      setNewIndustryName("");
      toast.success("Industria agregada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo agregar la industria.");
    } finally {
      setLoadingId(null);
    }
  };

  const updateIndustry = async (id: string, name: string) => {
    if (!name.trim()) return;
    setLoadingId(id);
    try {
      const res = await fetch(`/api/crm/industries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al actualizar");
      setIndustries((prev) => prev.map((i) => (i.id === id ? data.data : i)));
      toast.success("Industria actualizada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar.");
    } finally {
      setLoadingId(null);
    }
  };

  const deleteIndustry = async (id: string) => {
    setLoadingId(id);
    try {
      await fetch(`/api/crm/industries/${id}`, { method: "DELETE" });
      setIndustries((prev) => prev.filter((i) => i.id !== id));
      toast.success("Industria desactivada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo desactivar.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Industrias</CardTitle>
        <CardDescription>
          Opciones del campo Industria en Clientes. También aparecen en el cotizador de Gard Web.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2">
          <Input
            value={newIndustryName}
            onChange={(e) => setNewIndustryName(e.target.value)}
            placeholder="Ej: Eventos"
            className={inputClassName}
            onKeyDown={(e) => e.key === "Enter" && addIndustry()}
          />
          <Button size="sm" onClick={addIndustry} disabled={loadingId === "new-industry"}>
            Agregar
          </Button>
        </div>
        <div className="rounded-md border border-border divide-y divide-border max-h-60 overflow-y-auto">
          {industries.filter((i) => i.active).length === 0 ? (
            <p className="p-4 text-muted-foreground text-center">
              No hay industrias. Agrega una arriba.
            </p>
          ) : (
            industries
              .filter((i) => i.active)
              .sort((a, b) => a.order - b.order)
              .map((ind) => (
                <div
                  key={ind.id}
                  className="flex items-center justify-between px-3 py-2 gap-2"
                >
                  <span>{ind.name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => {
                        const name = window.prompt("Nuevo nombre:", ind.name);
                        if (name != null && name.trim()) updateIndustry(ind.id, name);
                      }}
                      disabled={loadingId === ind.id}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm({ open: true, id: ind.id })}
                      disabled={loadingId === ind.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Desactivar industria"
        description="El elemento será desactivado. Esta acción no se puede deshacer."
        confirmLabel="Desactivar"
        onConfirm={() => {
          const { id } = deleteConfirm;
          setDeleteConfirm({ open: false, id: "" });
          deleteIndustry(id);
        }}
      />
    </Card>
  );
}
