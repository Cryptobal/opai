const DB_NAME = "patrullaje_offline";
const DB_VERSION = 1;
const STORE_NAME = "marcaciones_queue";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "localId", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface OfflineMarcacion {
  localId?: number;
  executionId: string;
  checkpointId: string;
  lat: number;
  lng: number;
  verificationMethod: string;
  marcadoAt: string;
  photoUrl?: string | null;
  audioUrl?: string | null;
  note?: string | null;
  batteryLevel?: number | null;
  motionData?: Record<string, unknown> | null;
}

export async function addToQueue(item: Omit<OfflineMarcacion, "localId">): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(item);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = JSON.parse(localStorage.getItem("patrullaje_queue") || "[]");
    existing.push(item);
    localStorage.setItem("patrullaje_queue", JSON.stringify(existing));
  }
}

export async function getQueue(): Promise<OfflineMarcacion[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return JSON.parse(localStorage.getItem("patrullaje_queue") || "[]");
  }
}

export async function clearQueue(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.removeItem("patrullaje_queue");
  }
}

export async function removeFromQueue(localId: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(localId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // localStorage fallback doesn't support individual removal
  }
}
