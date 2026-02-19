/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ContractEditor } from "@/components/docs/ContractEditor";
import { Pencil, Trash2, Star, StarOff, Plus, Eye, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Signature = {
  id: string;
  name: string;
  content: any;
  htmlContent?: string | null;
  isDefault: boolean;
  userId?: string | null;
  createdAt: string;
};

/** Convierte Tiptap JSON a HTML string para embeber en emails */
function tiptapToHtml(doc: any): string {
  if (!doc || !doc.content) return "";

  const renderNode = (node: any): string => {
    if (!node) return "";

    switch (node.type) {
      case "doc":
        return (node.content || []).map(renderNode).join("");

      case "paragraph": {
        const style = node.attrs?.textAlign ? `text-align:${node.attrs.textAlign}` : "";
        const inner = (node.content || []).map(renderNode).join("");
        return inner
          ? `<p style="margin:0 0 4px;${style}">${inner}</p>`
          : `<p style="margin:0 0 4px;${style}">&nbsp;</p>`;
      }

      case "heading": {
        const level = node.attrs?.level || 2;
        const inner = (node.content || []).map(renderNode).join("");
        return `<h${level} style="margin:0 0 4px;">${inner}</h${level}>`;
      }

      case "text": {
        let text = node.text || "";
        // Escapar HTML
        text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const marks = node.marks || [];
        for (const mark of marks) {
          switch (mark.type) {
            case "bold":
              text = `<strong>${text}</strong>`;
              break;
            case "italic":
              text = `<em>${text}</em>`;
              break;
            case "underline":
              text = `<u>${text}</u>`;
              break;
            case "link":
              text = `<a href="${mark.attrs?.href || "#"}" style="color:#0059A3;text-decoration:none;" target="_blank">${text}</a>`;
              break;
            case "textStyle":
              if (mark.attrs?.color) {
                text = `<span style="color:${mark.attrs.color}">${text}</span>`;
              }
              break;
          }
        }
        return text;
      }

      case "hardBreak":
        return "<br/>";

      case "horizontalRule":
        return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;"/>`;

      case "pageBreak":
        return `<div style="page-break-before:always"></div>`;

      case "image":
        return `<img src="${node.attrs?.src || ""}" alt="${node.attrs?.alt || ""}" width="${node.attrs?.width || "auto"}" style="max-width:100%;"/>`;

      case "contractToken":
        // Los tokens se muestran como placeholder en la firma
        return `<span style="color:#1e40af;font-weight:500;">{{${node.attrs?.tokenKey || ""}}}</span>`;

      default:
        return (node.content || []).map(renderNode).join("");
    }
  };

  const body = renderNode(doc);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;margin-top:20px;border-top:1px solid #e5e7eb;padding-top:16px;">${body}</div>`;
}

export function SignatureManagerClient({
  initialSignatures,
}: {
  initialSignatures: Signature[];
}) {
  const [signatures, setSignatures] = useState<Signature[]>(initialSignatures);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Signature | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({
    open: false,
    id: "",
  });

  // Form state
  const [name, setName] = useState("");
  const [content, setContent] = useState<any>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const inputCn =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  const resetForm = () => {
    setName("");
    setContent(null);
    setIsDefault(false);
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (sig: Signature) => {
    setEditing(sig);
    setName(sig.name);
    setContent(sig.content);
    setIsDefault(sig.isDefault);
    setDialogOpen(true);
  };

  const handleContentChange = useCallback((newContent: any) => {
    setContent(newContent);
  }, []);

  const saveSignature = async () => {
    if (!name.trim()) {
      toast.error("Escribe un nombre para la firma.");
      return;
    }

    setSaving(true);
    try {
      const htmlContent = tiptapToHtml(content);
      const payload = { name, content, htmlContent, isDefault };

      const response = await fetch(
        editing ? `/api/crm/signatures/${editing.id}` : "/api/crm/signatures",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error guardando firma");

      if (editing) {
        setSignatures((prev) =>
          prev.map((s) => {
            if (s.id === editing.id) return data.data;
            // Si la editada es default, quitar default de las demás
            if (isDefault && s.isDefault && s.id !== editing.id)
              return { ...s, isDefault: false };
            return s;
          })
        );
      } else {
        setSignatures((prev) => {
          const updated = isDefault
            ? prev.map((s) => ({ ...s, isDefault: false }))
            : prev;
          return [data.data, ...updated];
        });
      }

      setDialogOpen(false);
      resetForm();
      toast.success(editing ? "Firma actualizada" : "Firma creada");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar la firma.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSignature = async (id: string) => {
    try {
      const res = await fetch(`/api/crm/signatures/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSignatures((prev) => prev.filter((s) => s.id !== id));
      toast.success("Firma eliminada");
    } catch {
      toast.error("No se pudo eliminar la firma.");
    }
  };

  const toggleDefault = async (sig: Signature) => {
    try {
      const newDefault = !sig.isDefault;
      const res = await fetch(`/api/crm/signatures/${sig.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: newDefault }),
      });
      if (!res.ok) throw new Error();

      setSignatures((prev) =>
        prev.map((s) => {
          if (s.id === sig.id) return { ...s, isDefault: newDefault };
          if (newDefault && s.isDefault) return { ...s, isDefault: false };
          return s;
        })
      );
      toast.success(newDefault ? "Firma marcada como predeterminada" : "Firma desmarcada");
    } catch {
      toast.error("No se pudo actualizar.");
    }
  };

  const showPreview = (sig: Signature) => {
    const html = sig.htmlContent || tiptapToHtml(sig.content);
    setPreviewHtml(html);
    setPreviewOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Firmas de email</CardTitle>
            <CardDescription>
              Crea firmas personalizadas para tus correos. La firma predeterminada se adjunta automáticamente.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva firma
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {signatures.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay firmas creadas. Crea tu primera firma para incluirla en los correos.
              </p>
            </div>
          )}
          {signatures.map((sig) => (
            <div
              key={sig.id}
              className="rounded-lg border border-border p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{sig.name}</p>
                    {sig.isDefault && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                        Predeterminada
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Creada el{" "}
                    {new Date(sig.createdAt).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* Preview mini */}
              {sig.htmlContent && (
                <div
                  className="text-xs text-muted-foreground border border-border rounded-md p-3 bg-muted/30 max-h-24 overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: sig.htmlContent }}
                />
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => openEdit(sig)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => showPreview(sig)}>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Vista previa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleDefault(sig)}
                >
                  {sig.isDefault ? (
                    <>
                      <StarOff className="h-3.5 w-3.5 mr-1" />
                      Quitar predeterminada
                    </>
                  ) : (
                    <>
                      <Star className="h-3.5 w-3.5 mr-1" />
                      Predeterminada
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirm({ open: true, id: sig.id })}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Editor Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar firma" : "Nueva firma"}</DialogTitle>
            <DialogDescription>
              Diseña tu firma con formato rico. Se incluirá automáticamente al final de los correos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre de la firma</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCn}
                  placeholder="Ej: Firma comercial"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm h-10">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                  />
                  Firma predeterminada
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Contenido de la firma</Label>
              <ContractEditor
                content={content}
                onChange={handleContentChange}
                editable
                placeholder="Cordialmente, &#10;&#10;Tu nombre&#10;Tu cargo&#10;+56 9 XXXX XXXX"
                filterModules={["system"]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveSignature} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Guardar cambios" : "Crear firma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vista previa de firma</DialogTitle>
            <DialogDescription>
              Así se verá tu firma al final de los correos.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border p-6 bg-white">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Eliminar firma"
        description="La firma será desactivada permanentemente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => {
          deleteSignature(deleteConfirm.id);
          setDeleteConfirm({ open: false, id: "" });
        }}
      />
    </>
  );
}
