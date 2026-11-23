// Credential state lives ONLY in this browser (IndexedDB). Keys must include the signed-in
// account as well as the campaign: sharing a browser must not let one student's pass (or
// "submitted" flag) be reused by another account. The server cannot recover a lost pass.
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
export async function loadLocal(key: string): Promise<LocalCred> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res((q.result as LocalCred) ?? {});
      q.onerror = () => res({});
    });
  } catch { return {}; }
}
export async function saveLocal(key: string, v: LocalCred): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
