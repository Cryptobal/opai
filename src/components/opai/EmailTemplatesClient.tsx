/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  scope: string;
  stageId?: string | null;
};

const PLACEHOLDERS = [
  { token: "{cliente}", label: "Cliente" },
  { token: "{contacto}", label: "Contacto" },
  { token: "{negocio}", label: "Negocio" },
  { token: "{etapa}", label: "Etapa" },
  { token: "{monto}", label: "Monto" },
  { token: "{correo}", label: "Correo" },
];

export function EmailTemplatesClient({ initialTemplates }: { initialTemplates: EmailTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState("global");
  const [loading, setLoading] = useState(false);
  const [suggestField, setSuggestField] = useState<"subject" | "body" | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  const resetForm = () => {
    setName("");
    setSubject("");
    setBody("");
    setScope("global");
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (template: EmailTemplate) => {
    setEditing(template);
    setName(template.name);
    setSubject(template.subject);
    setBody(template.body);
    setScope(template.scope);
    setOpen(true);
  };

  const saveTemplate = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      alert("Completa nombre, asunto y cuerpo.");
      return;
    }
    setLoading(true);
    try {
      const payload = { name, subject, body, scope };
      const response = await fetch(
        editing ? `/api/crm/email-templates/${editing.id}` : "/api/crm/email-templates",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error guardando template");
      if (editing) {
        setTemplates((prev) => prev.map((t) => (t.id === editing.id ? data.data : t)));
      } else {
        setTemplates((prev) => [data.data, ...prev]);
      }
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error(error);
      alert("No se pudo guardar el template.");
    } finally {
      setLoading(false);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!confirm("¿Eliminar este template?")) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/email-templates/${templateId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error eliminando template");
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (error) {
      console.error(error);
      alert("No se pudo eliminar el template.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (field: "subject" | "body") => (event: React.KeyboardEvent) => {
    if (event.key === "#") {
      setSuggestField(field);
    }
  };

  const insertPlaceholder = (field: "subject" | "body", token: string) => {
    const ref = field === "subject" ? subjectRef.current : bodyRef.current;
    if (!ref) return;
    const value = field === "subject" ? subject : body;
    const start = ref.selectionStart ?? value.length;
    const end = ref.selectionEnd ?? value.length;
    const hashIndex = value.lastIndexOf("#", start - 1);
    const insertAt = hashIndex >= 0 ? hashIndex : start;
    const nextValue = value.slice(0, insertAt) + token + value.slice(end);
    if (field === "subject") {
      setSubject(nextValue);
    } else {
      setBody(nextValue);
    }
    setSuggestField(null);
    requestAnimationFrame(() => {
      const pos = insertAt + token.length;
      ref.setSelectionRange(pos, pos);
      ref.focus();
    });
  };

  const suggestions = useMemo(
    () => (
      <div className="mt-2 grid gap-1 rounded-md border border-border bg-muted p-2 text-xs">
        {PLACEHOLDERS.map((item) => (
          <button
            key={item.token}
            type="button"
            className="flex items-center justify-between rounded px-2 py-1 text-left text-foreground hover:bg-accent"
            onClick={() => insertPlaceholder(suggestField || "body", item.token)}
          >
            <span>{item.label}</span>
            <span className="text-blue-300">{item.token}</span>
          </button>
        ))}
      </div>
    ),
    [suggestField]
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Templates de email</CardTitle>
          <CardDescription>Escribe # para insertar placeholders.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              Nuevo template
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar template" : "Nuevo template"}</DialogTitle>
              <DialogDescription>
                Usa # para insertar placeholders en asunto o mensaje.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={`h-9 w-full rounded-md border px-3 text-sm ${inputClassName}`}
                  placeholder="Seguimiento 1"
                />
              </div>
              <div className="space-y-2">
                <Label>Asunto</Label>
                <input
                  ref={subjectRef}
                  value={subject}
                  onKeyDown={handleKeyDown("subject")}
                  onChange={(event) => setSubject(event.target.value)}
                  className={`h-9 w-full rounded-md border px-3 text-sm ${inputClassName}`}
                  placeholder="Asunto del correo"
                />
                {suggestField === "subject" && suggestions}
              </div>
              <div className="space-y-2">
                <Label>Mensaje</Label>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onKeyDown={handleKeyDown("body")}
                  onChange={(event) => setBody(event.target.value)}
                  className={`min-h-[160px] w-full rounded-md border px-3 py-2 text-sm ${inputClassName}`}
                  placeholder="Mensaje..."
                />
                {suggestField === "body" && suggestions}
              </div>
              <div className="space-y-2">
                <Label>Alcance</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                >
                  <option value="global">Global</option>
                  <option value="stage">Por etapa (futuro)</option>
                  <option value="personal">Personal</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={saveTemplate} disabled={loading}>
                Guardar template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay templates creados todavía.
          </p>
        )}
        {templates.map((template) => (
          <div key={template.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {template.subject}
                </p>
              </div>
              <Badge variant="outline">{template.scope}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openEdit(template)}
              >
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => deleteTemplate(template.id)}
                disabled={loading}
              >
                Eliminar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
