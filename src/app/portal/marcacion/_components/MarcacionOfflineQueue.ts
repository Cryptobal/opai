/**
 * Offline queue for marcaciones.
 * Stores pending records in IndexedDB and syncs when online.
 */

const DB_NAME = "marcacion_offline";
const STORE_NAME = "pending";
const DB_VERSION = 1;

export interface OfflineMarcacion {
  id?: number;
  type: "face" | "pin";
  imageBase64?: string;
  rut?: string;
  pin?: string;
  installationId: string;
  tipo: "entrada" | "salida";
  lat: number | null;
  lng: number | null;
  deviceTimestamp: string;
  synced?: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const MarcacionOfflineQueue = {
  async add(marcacion: Omit<OfflineMarcacion, "id" | "synced">): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.add({ ...marcacion, synced: false });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error("[MarcacionOfflineQueue] Error adding:", err);
      // Fallback to localStorage
      try {
        const key = "marcacion_offline_pending";
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.push({ ...marcacion, synced: false });
        localStorage.setItem(key, JSON.stringify(existing));
      } catch { /* storage full or unavailable */ }
    }
  },

  async getAll(): Promise<OfflineMarcacion[]> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result ?? []);
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Fallback to localStorage
      try {
        return JSON.parse(localStorage.getItem("marcacion_offline_pending") || "[]");
      } catch {
        return [];
      }
    }
  },

  async remove(id: number): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore
    }
  },

  async syncAll(): Promise<{ synced: number; failed: number }> {
    const pending = await this.getAll();
    let synced = 0;
    let failed = 0;

    for (const marcacion of pending) {
      if (marcacion.synced) continue;

      try {
        let endpoint: string;
        let body: Record<string, unknown>;

        if (marcacion.type === "face") {
          endpoint = "/api/public/marcacion/face-verify";
          body = {
            image: marcacion.imageBase64,
            installationId: marcacion.installationId,
            tipo: marcacion.tipo,
            lat: marcacion.lat,
            lng: marcacion.lng,
            deviceTimestamp: marcacion.deviceTimestamp,
            offlineSync: true,
          };
        } else {
          endpoint = "/api/public/marcacion/registrar";
          body = {
            rut: marcacion.rut,
            pin: marcacion.pin,
            installationId: marcacion.installationId,
            tipo: marcacion.tipo,
            lat: marcacion.lat ?? 0,
            lng: marcacion.lng ?? 0,
            deviceTimestamp: marcacion.deviceTimestamp,
            offlineSync: true,
          };
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          if (marcacion.id) await this.remove(marcacion.id);
          synced++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    // Clear localStorage fallback if all synced
    if (synced > 0 && failed === 0) {
      try {
        localStorage.removeItem("marcacion_offline_pending");
      } catch { /* ignore */ }
    }

    return { synced, failed };
  },
};

// Auto-sync when coming back online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    MarcacionOfflineQueue.syncAll().then(({ synced }) => {
      if (synced > 0) {
        console.log(`[MarcacionOfflineQueue] Synced ${synced} offline marcaciones`);
      }
    });
  });
}
