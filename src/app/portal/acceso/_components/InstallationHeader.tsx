"use client";

import { Eye, UserRoundCheck, Wifi, WifiOff } from "lucide-react";

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
  isOnline,
  isPreview,
  onChangeGuard,
}: InstallationHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-800/60 bg-[#0A0F1C]/95 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Installation info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {installationName}
          </p>
          <button
            type="button"
            onClick={onChangeGuard}
            className="flex items-center gap-1 text-xs text-gray-400 transition-colors active:text-cyan-400"
          >
            <UserRoundCheck className="h-3 w-3 shrink-0" />
            <span className="truncate">{guardName}</span>
            <span className="text-[10px] text-gray-500">· Cambiar</span>
          </button>
        </div>

        {/* Right: Status indicators */}
        <div className="flex shrink-0 items-center gap-2">
          {isPreview && (
            <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5">
              <Eye className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] font-medium text-amber-400">Preview</span>
            </div>
          )}
          {isOnline ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <Wifi className="h-4 w-4 text-green-500" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              <WifiOff className="h-4 w-4 text-amber-500" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
