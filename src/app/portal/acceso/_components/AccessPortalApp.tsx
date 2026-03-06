"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { LoginScreen } from "./LoginScreen";
import { InstallationSelector } from "./InstallationSelector";
import { BottomTabBar } from "./BottomTabBar";
import { InstallationHeader } from "./InstallationHeader";
import { OfflineBanner } from "./OfflineBanner";
import InicioTab from "./tabs/InicioTab";
import RegistroTab from "./tabs/RegistroTab";
import EnSitioTab from "./tabs/EnSitioTab";
import MasTab from "./tabs/MasTab";
import type { AccessControlConfigData } from "@/lib/access-control/types";

export type TabId = "inicio" | "registro" | "en-sitio" | "mas";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
}

interface Installation {
  id: string;
  name: string;
  address: string;
}

const INSTALLATION_KEY = "acceso_selected_installation";

export function AccessPortalApp() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [selectedInstallation, setSelectedInstallation] =
    useState<Installation | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("inicio");
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [config, setConfig] = useState<AccessControlConfigData | null>(null);

  // Check auth session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          if (data?.user?.email) {
            setSession({
              id: data.user.id ?? "",
              name: data.user.name ?? "",
              email: data.user.email,
              role: data.user.role ?? "guardia",
              tenantId: data.user.tenantId ?? "",
            });
          } else {
            setSession(null);
          }
        } else {
          setSession(null);
        }
      } catch {
        setSession(null);
      } finally {
        setSessionLoading(false);
      }
    }
    checkSession();
  }, []);

  // Restore saved installation from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(INSTALLATION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Installation;
        if (parsed?.id) {
          setSelectedInstallation(parsed);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // Fetch access control config when installation is selected
  useEffect(() => {
    if (!selectedInstallation) {
      setConfig(null);
      return;
    }
    async function fetchConfig() {
      try {
        const res = await fetch(
          `/api/access-control/config/${selectedInstallation!.id}`
        );
        const json = await res.json();
        if (json.success) {
          setConfig(json.data);
        }
      } catch {
        // Will use default config
      }
    }
    fetchConfig();
  }, [selectedInstallation]);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Track pending offline records count
  useEffect(() => {
    async function countPending() {
      try {
        const dbs = await indexedDB.databases();
        const accesoDB = dbs.find((db) => db.name === "acceso_offline");
        if (!accesoDB) {
          setPendingCount(0);
          return;
        }
        const request = indexedDB.open("acceso_offline", 1);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("pending_records")) {
            setPendingCount(0);
            db.close();
            return;
          }
          const tx = db.transaction("pending_records", "readonly");
          const store = tx.objectStore("pending_records");
          const countReq = store.count();
          countReq.onsuccess = () => {
            setPendingCount(countReq.result);
            db.close();
          };
          countReq.onerror = () => {
            setPendingCount(0);
            db.close();
          };
        };
        request.onerror = () => setPendingCount(0);
      } catch {
        setPendingCount(0);
      }
    }

    countPending();
    const interval = setInterval(countPending, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleInstallationSelect = useCallback((installation: Installation) => {
    setSelectedInstallation(installation);
    localStorage.setItem(INSTALLATION_KEY, JSON.stringify(installation));
  }, []);

  const handleChangeInstallation = useCallback(() => {
    setSelectedInstallation(null);
    localStorage.removeItem(INSTALLATION_KEY);
  }, []);

  const handleLoginSuccess = useCallback(() => {
    // Re-check session after login
    setSessionLoading(true);
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.email) {
          setSession({
            id: data.user.id ?? "",
            name: data.user.name ?? "",
            email: data.user.email,
            role: data.user.role ?? "guardia",
            tenantId: data.user.tenantId ?? "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setSessionLoading(false));
  }, []);

  // Loading state
  if (sessionLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0A0F1C]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <p className="text-sm text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  // No installation selected
  if (!selectedInstallation) {
    return (
      <InstallationSelector
        guardId={session.id}
        onSelect={handleInstallationSelect}
      />
    );
  }

  // Main app with tabs
  return (
    <div className="flex min-h-dvh flex-col bg-[#0A0F1C]">
      <InstallationHeader
        installationName={selectedInstallation.name}
        guardName={session.name}
        isOnline={isOnline}
        onChangeInstallation={handleChangeInstallation}
      />

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-2">
        {activeTab === "inicio" && (
          <InicioTab
            installationId={selectedInstallation.id}
            installationName={selectedInstallation.name}
            guardName={session.name}
          />
        )}
        {activeTab === "registro" && config && (
          <RegistroTab
            installationId={selectedInstallation.id}
            guardId={session.id}
            tenantId={session.tenantId}
            config={config}
            onEntryRegistered={() => {
              // Refresh will happen naturally via tab switches
            }}
          />
        )}
        {activeTab === "en-sitio" && (
          <EnSitioTab
            installationId={selectedInstallation.id}
            guardId={session.id}
            maxStayHours={config?.maxStayHours}
          />
        )}
        {activeTab === "mas" && (
          <MasTab
            installationId={selectedInstallation.id}
            guardId={session.id}
            guardName={session.name}
            installationName={selectedInstallation.name}
            onChangeInstallation={handleChangeInstallation}
            onLogout={async () => {
              try {
                await fetch("/api/auth/signout", { method: "POST" });
              } catch {
                // ignore
              }
              window.location.href = "/portal/acceso";
            }}
          />
        )}
      </main>

      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />

      <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* FAB for quick entry */}
      {(activeTab === "inicio" || activeTab === "registro") && (
        <button
          type="button"
          onClick={() => setActiveTab("registro")}
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 transition-transform active:scale-95"
          aria-label="Registro rápido"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}
    </div>
  );
}

