"use client";

import { Loader2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CrmAccount, CrmPipelineStage } from "@/types";
import type { DealFormState } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: DealFormState;
  onChange: (key: keyof DealFormState, value: string) => void;
  accounts: CrmAccount[];
  stages: CrmPipelineStage[];
  loadingAccounts: boolean;
  creating: boolean;
  onSubmit: () => void;
};

export function CreateDealDialog({
  open,
  onOpenChange,
  form,
  onChange,
  accounts,
  stages,
  loadingAccounts,
  creating,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo negocio</DialogTitle>
          <DialogDescription>Crea una oportunidad y asigna cliente.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Cliente</Label>
            <Select value={form.accountId} onValueChange={(v) => onChange("accountId", v)}>
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue
                  placeholder={loadingAccounts ? "Cargando clientes…" : "Selecciona un cliente"}
                />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Título</Label>
            <Input
              className="h-10 sm:h-9"
              value={form.title}
              onChange={(e) => onChange("title", e.target.value)}
              placeholder="Oportunidad para..."
            />
          </div>
          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select value={form.stageId} onValueChange={(v) => onChange("stageId", v)}>
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue placeholder="Etapa por defecto" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Monto (CLP)</Label>
            <Input
              className="h-10 sm:h-9"
              value={form.amount}
              onChange={(e) => onChange("amount", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Probabilidad (%)</Label>
            <Input
              className="h-10 sm:h-9"
              value={form.probability}
              onChange={(e) => onChange("probability", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Cierre estimado</Label>
            <Input
              className="h-10 sm:h-9"
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => onChange("expectedCloseDate", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={creating} className="h-10 sm:h-9">
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar negocio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
