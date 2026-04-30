"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Phone, Plus, Unlink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { CARRIER_COLORS } from "@/lib/inventory/carrier-colors";

type AssignedLine = {
  id: string;
  phoneNumber: string;
  carrier: string;
  planType: string | null;
  status: string;
  label: string | null;
  assignments: { id: string; installation: { id: string; name: string } }[];
};

type AvailableLine = {
  id: string;
  phoneNumber: string;
  carrier: string;
  label: string | null;
};

function formatPhone(n: string) {
  const m = n.match(/^\+56(\d)(\d{4})(\d{4})$/);
  if (m) return `+56 ${m[1]} ${m[2]} ${m[3]}`;
  return n;
}

export function InstallationPhoneLines({ installationId }: { installationId: string }) {
  const [lines, setLines] = useState<AssignedLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [availableLines, setAvailableLines] = useState<AvailableLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchLines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines?installationId=${installationId}`);
      const data = await res.json();
      if (Array.isArray(data)) setLines(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  const openAssignDialog = async () => {
    setSelectedLineId("");
    setAssignOpen(true);
    try {
      const res = await fetch("/api/ops/inventario/phone-lines?unassigned=true&status=active");
      const data = await res.json();
      if (Array.isArray(data)) setAvailableLines(data);
    } catch {
      setAvailableLines([]);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLineId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines/${selectedLineId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Error al asignar");
        return;
      }
      toast.success("Línea asignada");
      setAssignOpen(false);
      fetchLines();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async (lineId: string) => {
    if (!confirm("¿Desvincular esta línea de la instalación?")) return;
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines/${lineId}/assign`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Error al desvincular");
        return;
      }
      toast.success("Línea desvinculada");
      fetchLines();
    } catch {
      toast.error("Error de conexión");
    }
  };

  if (loading) {
    return (
      <div className="rounded-ds-md border border-ds-border-default bg-ds-surface-1 p-4 sm:p-5">
        <h3 className="mb-3 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
          Líneas Telefónicas
        </h3>
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-ds-md border border-ds-border-default bg-ds-surface-1 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
            Líneas Telefónicas
          </h3>
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={openAssignDialog}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Asignar
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-ds-text-3">Sin líneas asignadas.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface-2 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="h-4 w-4 text-ds-text-4 shrink-0" />
                  <a
                    href={`tel:${line.phoneNumber}`}
                    className="text-[13px] font-mono font-medium text-ds-text-1 hover:underline whitespace-nowrap"
                  >
                    {formatPhone(line.phoneNumber)}
                  </a>
                  <Badge className={CARRIER_COLORS[line.carrier] ?? CARRIER_COLORS.otro}>
                    {line.carrier.charAt(0).toUpperCase() + line.carrier.slice(1)}
                  </Badge>
                  {line.label && (
                    <span className="text-[12px] text-ds-text-3 truncate">{line.label}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Desvincular"
                  onClick={() => handleUnassign(line.id)}
                >
                  <Unlink className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Assign Dialog ── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <form onSubmit={handleAssign}>
            <DialogHeader>
              <DialogTitle>Asignar línea telefónica</DialogTitle>
              <DialogDescription>
                Selecciona una línea disponible para asignar a esta instalación.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label>Línea disponible</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={selectedLineId}
                  options={availableLines.map((l) => ({
                    id: l.id,
                    label: `${formatPhone(l.phoneNumber)} (${l.carrier})`,
                    description: l.label ?? undefined,
                  }))}
                  placeholder="Buscar línea..."
                  emptyText="No hay líneas disponibles"
                  onChange={(id) => setSelectedLineId(id)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !selectedLineId}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Asignar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
