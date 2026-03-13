"use client";

import { ReactNode } from "react";
import { Download, FileText } from "lucide-react";

interface Props {
  title: string;
  description: string;
  filters: ReactNode;
  children: ReactNode;
  onExportExcel?: () => Promise<void>;
  onExportPdf?: () => Promise<void>;
  exporting?: boolean;
}

export function ReporteDtShell({ title, description, filters, children, onExportExcel, onExportPdf, exporting }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              disabled={exporting}
              className="flex items-center gap-1.5 text-sm border border-border px-3 py-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
          )}
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 text-sm border border-border px-3 py-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
          )}
        </div>
      </div>
      <div className="bg-card rounded-lg border border-border p-4">
        {filters}
      </div>
      {children}
    </div>
  );
}
