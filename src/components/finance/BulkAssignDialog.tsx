"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryMappingDialog } from "./cashflow/CategoryMappingDialog";

interface AccountPlanOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  accountPlans: AccountPlanOption[];
  onDone: () => void;
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  selectedIds,
  accountPlans,
  onDone,
}: Props) {
  const [accountPlanId, setAccountPlanId] = useState<string>("");
  const [note, setNote] = useState("");
  const [createRule, setCreateRule] = useState(true);
  const [ruleName, setRuleName] = useState("");
  const [saving, setSaving] = useState(false);
  const [unmapped, setUnmapped] = useState<
    Array<{ id: string; code: string; name: string }> | null
  >(null);

  const reset = () => {
    setAccountPlanId("");
    setNote("");
    setCreateRule(true);
    setRuleName("");
    setUnmapped(null);
  };

  const handleSave = async () => {
    if (!accountPlanId) {
      toast.error("Seleccioná una cuenta contable");
      return;
    }
    if (selectedIds.length === 0) {
      toast.error("No hay movimientos seleccionados");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/banking/transactions/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankTransactionIds: selectedIds,
          accountPlanId,
          note: note.trim() || undefined,
          createRule,
          ruleName: ruleName.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Error");
      const { assigned, errors, ruleCreated, unmappedAccounts } = json.data;
      toast.success(
        `${assigned} movimiento${assigned === 1 ? "" : "s"} asignado${assigned === 1 ? "" : "s"}` +
          (ruleCreated ? ` · regla '${ruleCreated.name}' creada` : "") +
          (errors?.length ? ` · ${errors.length} con error` : ""),
      );
      if (unmappedAccounts && unmappedAccounts.length > 0) {
        // No cerramos: el modal de mapeo se abre encima.
        setUnmapped(unmappedAccounts);
      } else {
        reset();
        onDone();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al asignar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open && !unmapped} onOpenChange={(o) => { if (!o) { reset(); onOpenChange(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Asignar cuenta a {selectedIds.length} movimiento{selectedIds.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Crea un vínculo contable a cada movimiento con la cuenta elegida. Si guardás como regla, los próximos movimientos similares se categorizarán automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-account">Cuenta contable</Label>
              <Select value={accountPlanId} onValueChange={setAccountPlanId}>
                <SelectTrigger id="bulk-account">
                  <SelectValue placeholder="Seleccioná una cuenta" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {accountPlans.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-[11px] text-muted-foreground mr-2">{a.code}</span>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bulk-note">Nota (opcional)</Label>
              <Input
                id="bulk-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej: Turnos extra de mayo"
              />
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={createRule} onCheckedChange={(v) => setCreateRule(!!v)} className="mt-0.5" />
                <div className="text-[12px]">
                  <div className="font-medium">Guardar como regla automática</div>
                  <div className="text-muted-foreground text-[11px]">
                    Los futuros movimientos con patrón similar (descripción + rango de monto) se categorizarán automáticamente a esta cuenta.
                  </div>
                </div>
              </label>
              {createRule && (
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Nombre de la regla (opcional)"
                  className="mt-1"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !accountPlanId}>
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Asignar {selectedIds.length} movimiento{selectedIds.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Si la cuenta no estaba mapeada al cashflow, se pide el mapping aquí */}
      {unmapped && unmapped.length > 0 && (
        <CategoryMappingDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) {
              reset();
              onDone();
            }
          }}
          accountPlanId={unmapped[0].id}
          accountCode={unmapped[0].code}
          accountName={unmapped[0].name}
          preferredKind="EXPENSE"
          onMapped={() => {
            reset();
            onDone();
          }}
        />
      )}
    </>
  );
}
