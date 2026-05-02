"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FormFieldConfig } from "@/lib/access-control/types";

interface Props {
  fields: FormFieldConfig[];
  initialData: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void;
}

export function DynamicFormRenderer({ fields, initialData, onSubmit }: Props) {
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    for (const field of sortedFields) {
      if (field.required) {
        const val = formData[field.field];
        if (val === undefined || val === null || val === "") {
          newErrors[field.field] = "Campo requerido";
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(formData);
  };

  const renderField = (field: FormFieldConfig) => {
    const value = formData[field.field];
    const error = errors[field.field];

    switch (field.type) {
      case "text":
      case "number":
        return (
          <div key={field.field} className="space-y-1">
            <Label className="text-zinc-400">
              {field.label}
              {field.required && <span className="text-status-danger-fg ml-0.5">*</span>}
            </Label>
            <Input
              type={field.type === "number" ? "number" : "text"}
              value={String(value || "")}
              onChange={(e) => handleChange(field.field, e.target.value)}
              placeholder={field.placeholder}
              className={`bg-zinc-800 border-zinc-600 ${error ? "border-status-danger-border" : ""}`}
            />
            {error && <p className="text-xs text-status-danger-fg">{error}</p>}
          </div>
        );

      case "textarea":
        return (
          <div key={field.field} className="space-y-1">
            <Label className="text-zinc-400">
              {field.label}
              {field.required && <span className="text-status-danger-fg ml-0.5">*</span>}
            </Label>
            <textarea
              value={String(value || "")}
              onChange={(e) => handleChange(field.field, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              className={`w-full rounded-md border bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 ${
                error ? "border-status-danger-border" : "border-zinc-600"
              }`}
            />
            {error && <p className="text-xs text-status-danger-fg">{error}</p>}
          </div>
        );

      case "select":
        return (
          <div key={field.field} className="space-y-1">
            <Label className="text-zinc-400">
              {field.label}
              {field.required && <span className="text-status-danger-fg ml-0.5">*</span>}
            </Label>
            <select
              value={String(value || "")}
              onChange={(e) => handleChange(field.field, e.target.value)}
              className={`w-full rounded-md border bg-zinc-800 px-3 py-2 text-sm text-zinc-200 ${
                error ? "border-status-danger-border" : "border-zinc-600"
              }`}
            >
              <option value="">Seleccionar...</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {error && <p className="text-xs text-status-danger-fg">{error}</p>}
          </div>
        );

      case "boolean":
        return (
          <div key={field.field} className="flex items-center justify-between py-2">
            <Label className="text-zinc-400">{field.label}</Label>
            <Switch
              checked={!!value}
              onCheckedChange={(v) => handleChange(field.field, v)}
            />
          </div>
        );

      case "date":
        return (
          <div key={field.field} className="space-y-1">
            <Label className="text-zinc-400">
              {field.label}
              {field.required && <span className="text-status-danger-fg ml-0.5">*</span>}
            </Label>
            <Input
              type="date"
              value={String(value || "")}
              onChange={(e) => handleChange(field.field, e.target.value)}
              className={`bg-zinc-800 border-zinc-600 ${error ? "border-status-danger-border" : ""}`}
            />
            {error && <p className="text-xs text-status-danger-fg">{error}</p>}
          </div>
        );

      case "photo":
      case "signature":
        return (
          <div key={field.field} className="space-y-1">
            <Label className="text-zinc-400">
              {field.label}
              {field.required && <span className="text-status-danger-fg ml-0.5">*</span>}
            </Label>
            <div className="rounded-md border border-dashed border-zinc-600 bg-zinc-800 p-4 text-center">
              <p className="text-xs text-zinc-500">
                {field.type === "photo" ? "Toca para tomar foto" : "Toca para firmar"}
              </p>
            </div>
            {error && <p className="text-xs text-status-danger-fg">{error}</p>}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {sortedFields.map(renderField)}
      <Button onClick={handleSubmit} className="w-full h-12 mt-4">
        <Check className="mr-2 h-4 w-4" />
        Siguiente
      </Button>
    </div>
  );
}
