// Per-campaign credential state lives ONLY in this browser (IndexedDB). It lets a refresh or a lost
// response be retried safely. The server cannot recover it, by design: a lost state means a lost vote.
import type { Prepared } from "./blind";

export interface LocalCred { prepared?: Prepared; signature?: string; submitted?: boolean }
const DB = "hidden-local", STORE = "creds";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function loadLocal(id: string): Promise<LocalCred> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction(STORE).objectStore(STORE).get(id);
      q.onsuccess = () => res((q.result as LocalCred) ?? {});
      q.onerror = () => res({});
    });
  } catch { return {}; }
}
export async function saveLocal(id: string, v: LocalCred): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
