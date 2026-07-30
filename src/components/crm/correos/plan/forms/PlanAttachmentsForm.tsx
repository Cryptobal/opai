"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlanAttachmentSelection } from "@/modules/crm/email/email-to-crm-structure.types";
import type { StagedFile } from "@/modules/crm/email/email-to-lead.types";

type Props = {
  stagedFiles: StagedFile[];
  selection: PlanAttachmentSelection;
  onChange: (s: PlanAttachmentSelection) => void;
};

function isDocFile(mime: string): boolean {
  return (
    mime.startsWith("application/pdf") ||
    mime.startsWith("application/msword") ||
    mime.includes("officedocument") ||
    mime.startsWith("text/")
  );
}

function isSmallImage(f: StagedFile): boolean {
  return f.mimeType.startsWith("image/") && f.size < 100 * 1024;
}

export function PlanAttachmentsForm({ stagedFiles, selection, onChange }: Props) {
  function toggleKey(key: string) {
    const next = selection.storageKeys.includes(key)
      ? selection.storageKeys.filter((k) => k !== key)
      : [...selection.storageKeys, key];
    onChange({ ...selection, storageKeys: next });
  }

  if (stagedFiles.length === 0) {
    return <p className="text-ds-body text-ds-text-3">Sin adjuntos disponibles.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {stagedFiles.map((f) => {
          const defaultOn = isDocFile(f.mimeType) && !isSmallImage(f);
          const checked = selection.storageKeys.includes(f.storageKey);
          return (
            <li key={f.storageKey} className="flex items-center gap-3">
              <Checkbox
                id={`att-${f.storageKey}`}
                checked={checked}
                defaultChecked={defaultOn}
                onCheckedChange={() => toggleKey(f.storageKey)}
                className="h-5 w-5"
              />
              <Label
                htmlFor={`att-${f.storageKey}`}
                className="min-w-0 flex-1 cursor-pointer text-ds-body text-ds-text-2"
              >
                <span className="block truncate">{f.fileName}</span>
                <span className="text-[12px] text-ds-text-4">
                  {f.mimeType.split("/")[1]?.toUpperCase()} ·{" "}
                  {f.size > 1024 * 1024
                    ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
                    : `${Math.round(f.size / 1024)} KB`}
                </span>
              </Label>
            </li>
          );
        })}
      </ul>
      <div className="space-y-1">
        <Label className="text-[12px] text-ds-text-3">Adjuntar en</Label>
        <Select
          value={selection.target}
          onValueChange={(v) =>
            onChange({ ...selection, target: v as PlanAttachmentSelection["target"] })
          }
        >
          <SelectTrigger className="h-10 text-ds-body sm:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deal">Negocio</SelectItem>
            <SelectItem value="account">Cuenta</SelectItem>
            <SelectItem value="both">Negocio y cuenta</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
