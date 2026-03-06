"use client";

import { ChevronDown, Wifi, WifiOff } from "lucide-react";

interface InstallationHeaderProps {
  installationName: string;
  guardName: string;
  isOnline: boolean;
  onChangeInstallation: () => void;
}

export function InstallationHeader({
  installationName,
  guardName,
  isOnline,
  onChangeInstallation,
}: InstallationHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-800/60 bg-[#0A0F1C]/95 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Installation info */}
        <button
          type="button"
          onClick={onChangeInstallation}
          className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-white">
                {installationName}
              </p>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </div>
            <p className="truncate text-xs text-gray-400">{guardName}</p>
          </div>
        </button>

        {/* Right: Online status */}
        <div className="flex shrink-0 items-center gap-1.5">
          {isOnline ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <Wifi className="h-4 w-4 text-green-500" />
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              <WifiOff className="h-4 w-4 text-amber-500" />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
