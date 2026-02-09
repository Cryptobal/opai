/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

type AccountFormState = {
  name: string;
  rut: string;
  segment: string;
  industry: string;
};

type AccountRow = {
  id: string;
  name: string;
  rut?: string | null;
  segment?: string | null;
  industry?: string | null;
  status: string;
  createdAt: string;
  _count?: {
    contacts: number;
    deals: number;
  };
};

const DEFAULT_FORM: AccountFormState = {
  name: "",
  rut: "",
  segment: "",
  industry: "",
};

export function CrmAccountsClient({ initialAccounts }: { initialAccounts: AccountRow[] }) {
  const [accounts, setAccounts] = useState<AccountRow[]>(initialAccounts);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputClassName =
    "bg-blue-900/30 text-white placeholder:text-blue-200 border-blue-700 focus-visible:ring-blue-400";

  const updateForm = (key: keyof AccountFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createAccount = async () => {
    if (!form.name.trim()) {
      alert("El nombre del cliente es obligatorio.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/crm/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error creando cliente");
      }
      setAccounts((prev) => [
        { ...payload.data, _count: { contacts: 0, deals: 0 } },
        ...prev,
      ]);
      setForm(DEFAULT_FORM);
      setOpen(false);
    } catch (error) {
      console.error(error);
      alert("No se pudo crear el cliente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Gestiona clientes con información mínima.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="secondary" className="h-9 w-9">
              <Plus className="h-4 w-4" />
              <span className="sr-only">Nuevo cliente</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuevo cliente</DialogTitle>
              <DialogDescription>
                Registra la cuenta con datos esenciales.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Nombre</Label>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Empresa"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>RUT</Label>
                <Input
                  value={form.rut}
                  onChange={(event) => updateForm("rut", event.target.value)}
                  placeholder="76.123.456-7"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Segmento</Label>
                <Input
                  value={form.segment}
                  onChange={(event) => updateForm("segment", event.target.value)}
                  placeholder="Corporativo"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Industria</Label>
                <Input
                  value={form.industry}
                  onChange={(event) => updateForm("industry", event.target.value)}
                  placeholder="Retail, minería, logística..."
                  className={inputClassName}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createAccount} disabled={loading}>
                Guardar cliente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
          <CardDescription>Listado de cuentas activas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay clientes creados todavía.
            </p>
          )}
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{account.name}</p>
                <p className="text-sm text-muted-foreground">
                  {account.rut || "Sin RUT"} · {account.industry || "Sin industria"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">
                  {account._count?.contacts ?? 0} contactos
                </Badge>
                <Badge variant="outline">
                  {account._count?.deals ?? 0} negocios
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
