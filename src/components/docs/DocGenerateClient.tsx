"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Loader2,
  Eye,
  Building2,
  User,
  MapPin,
  Handshake,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/opai";
import { ContractEditor } from "./ContractEditor";
import { DOC_CATEGORIES } from "@/lib/docs/token-registry";
import { toast } from "sonner";
import type { DocTemplate } from "@/types/docs";

const selectClass =
  "flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function DocGenerateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetTemplateId = searchParams.get("templateId");
  const presetAccountId = searchParams.get("accountId");
  const presetDealId = searchParams.get("dealId");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Step 1: Select template
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(presetTemplateId || "");
  const [selectedTemplate, setSelectedTemplate] = useState<DocTemplate | null>(null);

  // Step 2: Document metadata
  const [title, setTitle] = useState("");
  const [module, setModule] = useState("crm");
  const [category, setCategory] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");

  // Step 3: Entity selection
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState(presetAccountId || "");
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactId, setContactId] = useState("");
  const [installations, setInstallations] = useState<any[]>([]);
  const [installationId, setInstallationId] = useState("");
  const [dealId, setDealId] = useState(presetDealId || "");

  // Step 4: Content
  const [content, setContent] = useState<any>(null);
  const [resolved, setResolved] = useState(false);

  // Fetch templates
  useEffect(() => {
    fetch("/api/docs/templates")
      .then((r) => r.json())
      .then((d) => d.success && setTemplates(d.data || []))
      .catch(console.error);
  }, []);

  // Fetch accounts
  useEffect(() => {
    fetch("/api/crm/accounts")
      .then((r) => r.json())
      .then((d) => d.success && setAccounts(d.data || []))
      .catch(console.error);
  }, []);

  // Load template when selected
  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      return;
    }
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (tmpl) {
      setSelectedTemplate(tmpl);
      setContent(tmpl.content);
      setModule(tmpl.module);
      setCategory(tmpl.category);
      if (!title) setTitle(`${tmpl.name} - ${new Date().toLocaleDateString("es-CL")}`);
    }
  }, [selectedTemplateId, templates]);

  // Fetch contacts & installations when account changes
  useEffect(() => {
    if (!accountId) {
      setContacts([]);
      setInstallations([]);
      return;
    }
    Promise.all([
      fetch(`/api/crm/contacts?accountId=${accountId}`).then((r) => r.json()),
      fetch(`/api/crm/installations?accountId=${accountId}`).then((r) => r.json()),
    ]).then(([contactsRes, installRes]) => {
      if (contactsRes.success) setContacts(contactsRes.data || []);
      if (installRes.success) setInstallations(installRes.data || []);
    });
  }, [accountId]);

  // Resolve tokens
  const handleResolve = async () => {
    if (!content) {
      toast.error("No hay contenido para resolver");
      return;
    }
    setResolving(true);
    try {
      const res = await fetch("/api/docs/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          accountId: accountId || undefined,
          contactId: contactId || undefined,
          installationId: installationId || undefined,
          dealId: dealId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setContent(data.data.resolvedContent);
        setResolved(true);
        toast.success("Tokens resueltos con datos reales");
      } else {
        toast.error(data.error || "Error al resolver tokens");
      }
    } catch (error) {
      console.error("Error resolving:", error);
      toast.error("Error al resolver tokens");
    } finally {
      setResolving(false);
    }
  };

  // Save document
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("El título es requerido");
      return;
    }
    if (!category) {
      toast.error("Selecciona una categoría");
      return;
    }

    setSaving(true);
    try {
      const associations: any[] = [];
      if (accountId)
        associations.push({ entityType: "crm_account", entityId: accountId, role: "primary" });
      if (contactId)
        associations.push({ entityType: "crm_contact", entityId: contactId, role: "related" });
      if (installationId)
        associations.push({ entityType: "crm_installation", entityId: installationId, role: "related" });
      if (dealId)
        associations.push({ entityType: "crm_deal", entityId: dealId, role: "primary" });

      const res = await fetch("/api/docs/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId || undefined,
          title: title.trim(),
          content,
          module,
          category,
          effectiveDate: effectiveDate || undefined,
          expirationDate: expirationDate || undefined,
          associations,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al crear documento");
        return;
      }

      toast.success("Documento creado exitosamente");
      router.push(`/opai/documentos/${data.data.id}`);
    } catch (error) {
      console.error("Error creating document:", error);
      toast.error("Error al crear documento");
    } finally {
      setSaving(false);
    }
  };

  const categories = DOC_CATEGORIES[module] || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        backHref="/opai/documentos"
        backLabel="Documentos"
        title="Nuevo Documento"
        actions={
          <>
            {content && !resolved && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleResolve}
                disabled={resolving}
              >
                {resolving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                Resolver Tokens
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar Documento
            </Button>
          </>
        }
      />

      {/* Configuration panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Metadata */}
        <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
          <h3 className="text-sm font-semibold">Configuración</h3>

          {/* Template selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Template base
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className={`mt-1 ${selectClass}`}
            >
              <option value="">Sin template (documento libre)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.module.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Título del Documento *
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contrato de Servicios - Cliente XYZ"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Módulo
              </label>
              <select
                value={module}
                onChange={(e) => {
                  setModule(e.target.value);
                  setCategory("");
                }}
                className={`mt-1 ${selectClass}`}
              >
                <option value="crm">CRM</option>
                <option value="payroll">Payroll</option>
                <option value="legal">Legal</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Categoría *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`mt-1 ${selectClass}`}
              >
                <option value="">Seleccionar...</option>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Fecha Inicio
              </label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Fecha Vencimiento
              </label>
              <Input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Center + Right: Entity selectors */}
        <div className="lg:col-span-2 space-y-4 p-4 rounded-lg border border-border bg-card">
          <h3 className="text-sm font-semibold">Asociar Entidades CRM</h3>
          <p className="text-xs text-muted-foreground -mt-2">
            Selecciona las entidades para resolver los tokens del documento
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Account */}
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Cuenta / Empresa
              </label>
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setContactId("");
                  setInstallationId("");
                }}
                className={`mt-1 ${selectClass}`}
              >
                <option value="">Seleccionar cuenta...</option>
                {accounts.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.rut ? ` (${a.rut})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Contact */}
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                Contacto
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={!accountId}
                className={`mt-1 ${selectClass} disabled:opacity-50`}
              >
                <option value="">
                  {accountId ? "Seleccionar contacto..." : "Selecciona una cuenta primero"}
                </option>
                {contacts.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                    {c.roleTitle ? ` - ${c.roleTitle}` : ""}
                    {c.isPrimary ? " (Principal)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Installation */}
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Instalación
              </label>
              <select
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
                disabled={!accountId}
                className={`mt-1 ${selectClass} disabled:opacity-50`}
              >
                <option value="">
                  {accountId ? "Seleccionar instalación..." : "Selecciona una cuenta primero"}
                </option>
                {installations.map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.address ? ` - ${i.address}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Deal */}
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Handshake className="h-3 w-3" />
                Negocio
              </label>
              <Input
                type="text"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                placeholder="ID del negocio (opcional)"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Editor */}
      <ContractEditor
        content={content}
        onChange={setContent}
        editable={!resolved}
        placeholder={
          selectedTemplate
            ? "El contenido del template se cargó. Puedes editarlo antes de resolver los tokens."
            : "Escribe el contenido del documento aquí..."
        }
      />

      {resolved && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Eye className="h-4 w-4 text-emerald-400" />
          <p className="text-sm text-emerald-400 flex-1">
            Los tokens han sido resueltos con datos reales. El documento está
            listo para guardar.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setResolved(false);
              if (selectedTemplate) setContent(selectedTemplate.content);
            }}
          >
            Revertir
          </Button>
        </div>
      )}
    </div>
  );
}
