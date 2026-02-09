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

type ContactRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
  account?: {
    id: string;
    name: string;
  } | null;
};

type AccountRow = {
  id: string;
  name: string;
};

type ContactFormState = {
  accountId: string;
  name: string;
  email: string;
  phone: string;
  roleTitle: string;
  isPrimary: boolean;
};

const DEFAULT_FORM: ContactFormState = {
  accountId: "",
  name: "",
  email: "",
  phone: "",
  roleTitle: "",
  isPrimary: false,
};

export function CrmContactsClient({
  initialContacts,
  accounts,
}: {
  initialContacts: ContactRow[];
  accounts: AccountRow[];
}) {
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [form, setForm] = useState<ContactFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const updateForm = (key: keyof ContactFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createContact = async () => {
    if (!form.accountId) {
      alert("Selecciona un cliente.");
      return;
    }
    if (!form.name.trim()) {
      alert("El nombre del contacto es obligatorio.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error creando contacto");
      }
      setContacts((prev) => [payload.data, ...prev]);
      setForm(DEFAULT_FORM);
      setOpen(false);
    } catch (error) {
      console.error(error);
      alert("No se pudo crear el contacto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Contactos principales por cliente.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="secondary" className="h-9 w-9">
              <Plus className="h-4 w-4" />
              <span className="sr-only">Nuevo contacto</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuevo contacto</DialogTitle>
              <DialogDescription>
                Asócialo a un cliente existente.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Cliente</Label>
                <select
                  className={selectClassName}
                  value={form.accountId}
                  onChange={(event) => updateForm("accountId", event.target.value)}
                >
                  <option value="">Selecciona un cliente</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Nombre completo"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Input
                  value={form.roleTitle}
                  onChange={(event) => updateForm("roleTitle", event.target.value)}
                  placeholder="Gerente, jefe, etc."
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="correo@empresa.com"
                  className={inputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="+56 9 1234 5678"
                  className={inputClassName}
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isPrimary}
                    onChange={(event) => updateForm("isPrimary", event.target.checked)}
                  />
                  Contacto principal
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createContact} disabled={loading}>
                Guardar contacto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contactos</CardTitle>
          <CardDescription>Listado por cliente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay contactos registrados.
            </p>
          )}
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{contact.name}</p>
                <p className="text-sm text-muted-foreground">
                  {contact.email || "Sin email"} · {contact.phone || "Sin teléfono"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {contact.account?.name || "Sin cliente asociado"}
                </p>
              </div>
              {contact.isPrimary && <Badge variant="outline">Principal</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
