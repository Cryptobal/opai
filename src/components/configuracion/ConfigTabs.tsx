"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface ConfigTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: ReactNode;
}

interface ConfigTabsProps {
  tabs: ConfigTab[];
  defaultTab?: string;
}

export function ConfigTabs({ tabs, defaultTab }: ConfigTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  const resolveInitialTab = () => {
    if (tabFromUrl && tabs.some((t) => t.id === tabFromUrl)) return tabFromUrl;
    if (defaultTab && tabs.some((t) => t.id === defaultTab)) return defaultTab;
    return tabs[0]?.id ?? "";
  };

  const [activeTab, setActiveTab] = useState(resolveInitialTab);

  // Sync URL when tab changes from user interaction
  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tabId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Sync state if URL changes externally (e.g., browser back/forward)
  useEffect(() => {
    if (tabFromUrl && tabs.some((t) => t.id === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, tabs]);

  const activeTabData = tabs.find((t) => t.id === activeTab);

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab content */}
      <div key={activeTab} className="animate-in fade-in duration-200">
        {activeTabData?.content}
      </div>
    </div>
  );
}
