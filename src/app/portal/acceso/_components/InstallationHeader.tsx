"use client";

import { Eye, UserRoundCheck } from "lucide-react";

interface InstallationHeaderProps {
  installationName: string;
  guardName: string;
  isOnline: boolean;
  isPreview?: boolean;
  onChangeGuard: () => void;
}

export function InstallationHeader({
  installationName,
  guardName,
  isPreview,
  onChangeGuard,
}: InstallationHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-ds-border-subtle bg-ds-surface-1 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ds-text-1">
            {installationName}
          </p>
          <button
            type="button"
            onClick={onChangeGuard}
            className="flex min-h-11 items-center gap-1 text-sm text-ds-text-3"
          >
            <UserRoundCheck className="h-4 w-4 shrink-0" />
            <span className="break-words">{guardName}</span>
            <span className="text-ds-text-4">· Cambiar</span>
          </button>
        </div>

        {isPreview && (
          <div className="flex items-center gap-1 rounded-full bg-status-warn-soft px-2 py-0.5">
            <Eye className="h-3 w-3 text-status-warn-fg" />
            <span className="text-xs font-medium text-status-warn-fg">Preview</span>
          </div>
        )}
      </div>
    </header>
  );
}
