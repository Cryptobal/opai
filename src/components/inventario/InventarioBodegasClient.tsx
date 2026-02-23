"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

type Warehouse = {
  id: string;
  name: string;
  type: string;
  supervisor?: { name: string } | null;
  installation?: { name: string } | null;
};

export function InventarioBodegasClient() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "central" as "central" | "supervisor" | "installation" | "other",
  });

  const [error, setError] = useState<string | null>(null);

  const fetchWarehouses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/inventario/warehouses");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setWarehouses(data);
      else setError(data?.error || "Error al cargar bodegas.");
    } catch (e) {
      console.error(e);
      setError("No se pudo conectar al servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/ops/inventario/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, type: form.type }),
      });
      const data = await res.json();
      if (data.id) {
        setDialogOpen(false);
        setForm({ name: "", type: "central" });
        fetchWarehouses();
      } else {
        alert(data.error || "Error al crear bodega");
      }
    } catch (e) {
      console.error(e);
      alert("Error al crear bodega");
    }
  };

  const typeLabels: Record<string, string> = {
    central: "Central",
    supervisor: "Supervisor",
    installation: "Instalación",
    other: "Otro",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Bodegas virtuales</CardTitle>
          <CardDescription>
            Cada bodega puede ser central, de un supervisor o de una instalación.
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name: "", type: "central" })}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva bodega
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Nueva bodega</DialogTitle>
                <DialogDescription>
                  Crea una bodega virtual para almacenar stock.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Bodega central, Supervisor Juan"
                    required
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, type: v as typeof form.type }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="central">Central</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="installation">Instalación</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Crear</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </div>
        ) : warehouses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay bodegas. Crea una para poder registrar compras.
          </p>
        ) : (
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{w.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary">{typeLabels[w.type] ?? w.type}</Badge>
                    {w.supervisor && (
                      <span className="text-xs text-muted-foreground">
                        {w.supervisor.name}
                      </span>
                    )}
                    {w.installation && (
                      <span className="text-xs text-muted-foreground">
                        {w.installation.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
