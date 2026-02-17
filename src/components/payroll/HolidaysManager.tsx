"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, CalendarDays } from "lucide-react";

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: string;
  year: number;
  isActive: boolean;
}

export function HolidaysManager() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("normal");
  const [saving, setSaving] = useState(false);

  const selectClass = "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/holidays?year=${selectedYear}`);
      if (res.ok) {
        const json = await res.json();
        setHolidays(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { loadHolidays(); }, [loadHolidays]);

  const openCreate = () => {
    setEditingId(null);
    setFormDate(`${selectedYear}-01-01`);
    setFormName("");
    setFormType("normal");
    setModalOpen(true);
  };

  const openEdit = (h: Holiday) => {
    setEditingId(h.id);
    setFormDate(h.date.slice(0, 10));
    setFormName(h.name);
    setFormType(h.type);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formDate || !formName) return;
    setSaving(true);
    try {
      const url = editingId ? `/api/payroll/holidays/${editingId}` : "/api/payroll/holidays";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: formDate, name: formName, type: formType }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error");
        return;
      }
      setModalOpen(false);
      await loadHolidays();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: Holiday) => {
    if (!confirm(`¿Eliminar el feriado "${h.name}" (${formatDate(h.date)})?`)) return;
    try {
      await fetch(`/api/payroll/holidays/${h.id}`, { method: "DELETE" });
      await loadHolidays();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">Feriados</CardTitle>
          <select
            className="flex h-8 rounded-md border border-input bg-card px-2 text-sm"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Agregar feriado
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay feriados configurados para {selectedYear}.
          </p>
        ) : (
          <div className="space-y-1.5">
            {holidays.map((h) => {
              const d = new Date(h.date + "T12:00:00Z");
              const dayName = DAY_NAMES[d.getUTCDay()];
              const monthName = MONTHS[d.getUTCMonth()];
              const dayNum = d.getUTCDate();

              return (
                <div
                  key={h.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-accent/20 transition-colors"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <span className="text-[10px] font-medium leading-none">{monthName}</span>
                    <span className="text-base font-bold leading-tight">{dayNum}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{h.name}</span>
                      {h.type === "irrenunciable" && (
                        <Badge variant="destructive" className="text-[9px]">Irrenunciable</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {dayName} {dayNum} de {monthName} {h.year}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(h)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(h)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar feriado" : "Agregar feriado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha</Label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre del feriado</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Año Nuevo"
                className="h-10 bg-background text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <select
                className={selectClass}
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="irrenunciable">Irrenunciable</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !formDate || !formName}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Actualizar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}
