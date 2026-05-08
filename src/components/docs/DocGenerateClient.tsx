"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Info as InfoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/opai-ds";
import { FileText as FileTextIcon } from "lucide-react";
import { ContractEditor } from "./ContractEditor";
import { DOC_CATEGORIES } from "@/lib/docs/token-registry";
import { hasContractTokens } from "@/lib/docs/has-tokens";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DocTemplate } from "@/types/docs";

const CATEGORY_HELP_TEXT: Record<string, string> = {
  contrato_cliente: "Contrato marco con un cliente.",
  contrato_servicio: "Contrato de prestación de servicios específico.",
  contrato_confidencialidad: "NDA — acuerdo de no divulgación.",
  acuerdo_nivel_servicio: "SLA — niveles y métricas de servicio comprometidos.",
  adendum: "Modificación o anexo a un contrato existente.",
  contrato_laboral: "Contrato de trabajo con un colaborador.",
  anexo_contrato: "Anexo a un contrato laboral existente.",
  finiquito: "Documento de término de relación laboral.",
  carta_aviso_termino: "Aviso formal de término del contrato laboral.",
  poder_notarial: "Poder otorgado ante notario.",
  carta_compromiso: "Compromiso formal entre partes.",
};

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

  // Validation state + refs for visual feedback / scroll-to-error.
  const titleRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

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

  // Auto-suggest title when account + category change, but only if the user
  // hasn't typed anything yet. Title is intentionally NOT in deps to avoid loop.
  useEffect(() => {
    if (title.trim()) return;
    if (!accountId && !category) return;
    const accountName = accounts.find((a) => a.id === accountId)?.name;
    const categoryLabel = (DOC_CATEGORIES[module] || []).find(
      (c) => c.key === category,
    )?.label;
    const dateStr = new Date().toLocaleDateString("es-CL", {
      month: "short",
      year: "numeric",
    });
    const parts = [categoryLabel, accountName, dateStr].filter(Boolean);
    if (parts.length === 0) return;
    setTitle(parts.join(" - "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, category, module, accounts]);

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
      setTitleError("El título es requerido");
      titleRef.current?.focus();
      titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error(
        "Título requerido — usa un nombre interno (ej: 'Contrato Servicios - <Cliente> - May 2026')",
      );
      return;
    }
    setTitleError(null);
    if (!category) {
      setCategoryError("Selecciona una categoría");
      categoryRef.current?.focus();
      categoryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error("Selecciona una categoría");
      return;
    }
    setCategoryError(null);

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
      <PageHero
        icon={<FileTextIcon />}
        iconTone="rose"
        backHref="/opai/documentos"
        backLabel="Documentos"
        title="Nuevo Documento"
        actions={
          <TooltipProvider delayDuration={150}>
            {content && !resolved && hasContractTokens(content) && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>
                  Reemplaza placeholders como{" "}
                  <code className="font-mono">{`{{cliente.razonSocial}}`}</code>{" "}
                  con datos reales de las entidades asociadas.
                </TooltipContent>
              </Tooltip>
            )}
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar Documento
            </Button>
          </TooltipProvider>
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
            <div className="mt-1">
              <SearchableSelect
                value={selectedTemplateId}
                options={templates.map((t) => ({
                  id: t.id,
                  label: `${t.name} (${t.module.toUpperCase()})`,
                }))}
                placeholder="Sin template (documento libre)"
                emptyText="Sin templates disponibles"
                onChange={(id) => setSelectedTemplateId(id)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Título del Documento *
              <span className="text-muted-foreground/70 text-[10px] ml-1">
                (uso interno)
              </span>
            </label>
            <Input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              placeholder="Nombre interno del documento (ej: Contrato Servicios - FT Foods - May 2026)"
              className={`mt-1 ${
                titleError ? "border-destructive ring-1 ring-destructive" : ""
              }`}
              aria-invalid={Boolean(titleError)}
            />
            {titleError && (
              <p className="text-xs text-destructive mt-1">{titleError}</p>
            )}
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
                ref={categoryRef}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (categoryError) setCategoryError(null);
                }}
                className={`mt-1 ${selectClass} ${
                  categoryError ? "border-destructive ring-1 ring-destructive" : ""
                }`}
                aria-invalid={Boolean(categoryError)}
              >
                <option value="">Seleccionar...</option>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              {categoryError && (
                <p className="text-xs text-destructive mt-1">{categoryError}</p>
              )}
              {!categoryError && category && CATEGORY_HELP_TEXT[category] && (
                <p className="text-[12px] text-muted-foreground mt-1">
                  {CATEGORY_HELP_TEXT[category]}
                </p>
              )}
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
          <div>
            <h3 className="text-sm font-semibold">Asociar Entidades CRM</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Selecciona las entidades para resolver los tokens del documento
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Account */}
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Cuenta / Empresa
              </label>
              <div className="mt-1">
                <SearchableSelect
                  value={accountId}
                  options={accounts.map((a: any) => ({
                    id: a.id,
                    label: a.name,
                    description: a.rut || undefined,
                  }))}
                  placeholder="Seleccionar cuenta..."
                  emptyText="Sin cuentas"
                  onChange={(id) => {
                    setAccountId(id);
                    setContactId("");
                    setInstallationId("");
                  }}
                />
              </div>
            </div>

            {/* Contact */}
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                Contacto
              </label>
              <div className="mt-1">
                <SearchableSelect
                  value={contactId}
                  options={contacts.map((c: any) => ({
                    id: c.id,
                    label: `${c.firstName} ${c.lastName}${c.roleTitle ? ` - ${c.roleTitle}` : ""}${c.isPrimary ? " (Principal)" : ""}`,
                  }))}
                  placeholder={accountId ? "Seleccionar contacto..." : "Selecciona una cuenta primero"}
                  emptyText="Sin contactos"
                  disabled={!accountId}
                  onChange={(id) => setContactId(id)}
                />
              </div>
            </div>

            {/* Installation */}
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Instalación
              </label>
              <div className="mt-1">
                <SearchableSelect
                  value={installationId}
                  options={installations.map((i: any) => ({
                    id: i.id,
                    label: i.name,
                    description: i.address || undefined,
                  }))}
                  placeholder={accountId ? "Seleccionar instalación..." : "Selecciona una cuenta primero"}
                  emptyText="Sin instalaciones"
                  disabled={!accountId}
                  onChange={(id) => setInstallationId(id)}
                />
              </div>
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

      {/* Editor banner — guidance for users pasting Word docs */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-2">
        <InfoIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">¿Pegando un Word?</strong> Pega
            tu contenido aquí y al final inserta el bloque de firmas con el
            botón <strong className="text-foreground">"Insertar firmas"</strong>{" "}
            de la toolbar.
          </p>
          <p>
            Los <strong className="text-foreground">tokens</strong> (ej:{" "}
            <code className="font-mono">{`{{cliente.razonSocial}}`}</code>) se
            reemplazan por datos reales con el botón "Resolver Tokens" antes de
            guardar.
          </p>
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
        <div className="flex items-center gap-3 p-3 rounded-lg bg-status-ok-soft border border-status-ok-border">
          <Eye className="h-4 w-4 text-status-ok-fg" />
          <p className="text-sm text-status-ok-fg flex-1">
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
