"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
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
  variant?: "pills" | "bar";
}

export function ConfigTabs({ tabs, defaultTab, variant = "bar" }: ConfigTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const scrollRef = useRef<HTMLDivElement>(null);

  const resolveInitialTab = () => {
    if (tabFromUrl && tabs.some((t) => t.id === tabFromUrl)) return tabFromUrl;
    if (defaultTab && tabs.some((t) => t.id === defaultTab)) return defaultTab;
    return tabs[0]?.id ?? "";
  };

  const [activeTab, setActiveTab] = useState(resolveInitialTab);

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tabId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (tabFromUrl && tabs.some((t) => t.id === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, tabs]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeBtn = scrollRef.current.querySelector<HTMLElement>(
      `[data-tab-id="${activeTab}"]`,
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [activeTab]);

  const activeTabData = tabs.find((t) => t.id === activeTab);

  return (
    <div className="space-y-4">
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          ref={scrollRef}
          className={cn(
            "flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide snap-x snap-mandatory",
            variant === "bar" && "rounded-xl bg-card/80 border border-border p-1",
          )}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "relative whitespace-nowrap shrink-0 flex items-center gap-1.5 text-xs font-medium transition-all duration-200 snap-start",
                  variant === "bar" && [
                    "rounded-lg px-3.5 py-2",
                    isActive
                      ? "bg-primary/12 text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  ],
                  variant === "pills" && [
                    "rounded-full px-3.5 py-1.5 border",
                    isActive
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border-transparent",
                  ],
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {tab.label}
                {isActive && variant === "bar" && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-primary/50" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
      <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
        {activeTabData?.content}
      </div>
    </div>
  );
}
