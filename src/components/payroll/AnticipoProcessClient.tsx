"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, CheckCircle2, DollarSign } from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface AnticipoProcess {
  id: string;
  status: string;
  totalAmount: string | number;
  totalGuards: number;
  processDate: string;
  period: { year: number; month: number };
  _count: { items: number };
}

interface Period {
  id: string;
  year: number;
  month: number;
  status: string;
}

export function AnticipoProcessClient() {
  const [processes, setProcesses] = useState<AnticipoProcess[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [creating, setCreating] = useState(false);

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, perRes] = await Promise.all([
        fetch("/api/payroll/anticipos"),
        fetch("/api/payroll/periodos"),
      ]);
      if (pRes.ok) setProcesses((await pRes.json()).data || []);
      if (perRes.ok) setPeriods((await perRes.json()).data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!selectedPeriod) return;
    setCreating(true);
    try {
      const res = await fetch("/api/payroll/anticipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: selectedPeriod }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error");
        return;
      }
      setCreateOpen(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleApprove = async (id: string) => {
    await fetch(`/api/payroll/anticipos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    await load();
  };

  const handlePaid = async (id: string) => {
    if (!confirm("¿Marcar como pagado?")) return;
    await fetch(`/api/payroll/anticipos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID" }),
    });
    await load();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setSelectedPeriod(periods[0]?.id ?? ""); setCreateOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Generar anticipo
        </Button>
      </div>

      {processes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay procesos de anticipo. Genera uno seleccionando un período.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {processes.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-medium">
                      {MONTHS[p.period.month - 1]} {p.period.year}
                    </span>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {p.totalGuards} guardias · Total: ${Number(p.totalAmount).toLocaleString("es-CL")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.status === "DRAFT" && (
                    <Button size="sm" variant="outline" onClick={() => handleApprove(p.id)}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Aprobar
                    </Button>
                  )}
                  {p.status === "APPROVED" && (
                    <Button size="sm" onClick={() => handlePaid(p.id)}>
                      Marcar pagado
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generar proceso de anticipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Período</Label>
            <select className={selectClass} value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
              <option value="">Selecciona...</option>
              {periods.filter((p) => p.status !== "PAID").map((p) => (
                <option key={p.id} value={p.id}>{MONTHS[p.month - 1]} {p.year}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">Se incluirán todos los guardias activos con anticipo configurado.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !selectedPeriod}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
