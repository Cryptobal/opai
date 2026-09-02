"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { usePlatformUi } from "./PlatformUiProvider";
import { RoleGuard } from "./RoleGuard";

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function CreateTenantSheet() {
  const { createOpen, closeCreateTenant, can } = usePlatformUi();
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [companyRut, setCompanyRut] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [plan, setPlan] = useState("profesional");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName("");
    setSlug("");
    setCompanyRut("");
    setOwnerName("");
    setOwnerEmail("");
    setOwnerPassword("");
    setPlan("profesional");
    setError("");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!can("admin")) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          companyRut: companyRut || undefined,
          ownerName,
          ownerEmail,
          ownerPassword,
          plan,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      reset();
      closeCreateTenant();
      router.push(`/platform/tenants/${data.tenant.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el tenant");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      open={createOpen}
      onOpenChange={(open) => {
        if (!open) closeCreateTenant();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-ds-surface-1">
        <SheetHeader>
          <SheetTitle className="font-display">Nuevo tenant</SheetTitle>
          <SheetDescription className="text-ds-text-3">
            Crea la empresa, el owner y un trial según el catálogo.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="rounded-lg border border-status-danger-border bg-status-danger-soft px-3 py-2 text-[13px] text-status-danger-fg">
              {error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pt-name">Empresa</Label>
            <Input
              id="pt-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              required
              className="h-10 sm:h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-slug">Slug</Label>
            <Input id="pt-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required className="h-10 sm:h-9 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-rut">RUT empresa</Label>
            <Input id="pt-rut" value={companyRut} onChange={(e) => setCompanyRut(e.target.value)} className="h-10 sm:h-9 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-owner">Owner</Label>
            <Input id="pt-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required className="h-10 sm:h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-email">Email owner</Label>
            <Input id="pt-email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required className="h-10 sm:h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-pass">Password temporal</Label>
            <Input id="pt-pass" type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} required minLength={8} className="h-10 sm:h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-plan">Plan</Label>
            <select
              id="pt-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="flex h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-2 px-3 text-[13px] text-ds-text-1"
            >
              <option value="starter">Starter</option>
              <option value="profesional">Profesional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <RoleGuard minRole="admin">
            <Button type="submit" variant="primary" disabled={loading || !can("admin")} className="w-full h-10 sm:h-9">
              {loading ? "Creando…" : "Crear tenant"}
            </Button>
          </RoleGuard>
        </form>
      </SheetContent>
    </Sheet>
  );
}
