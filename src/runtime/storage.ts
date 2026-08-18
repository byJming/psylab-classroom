import type { ResultBundle, SessionManifest, TrialRecord } from "../types";

const DB_NAME = "psylab-local";
const DB_VERSION = 2;
const RUN_STORE = "runs";
const RESULT_STORE = "results";
const LATEST_RESULT_KEY = "latest";
const memory = new Map<string, unknown>();

function canUseIndexedDb(): boolean { return typeof indexedDB !== "undefined"; }

async function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RUN_STORE)) request.result.createObjectStore(RUN_STORE);
      if (!request.result.objectStoreNames.contains(RESULT_STORE)) request.result.createObjectStore(RESULT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export interface RunDraft { manifest: SessionManifest; participantCode: string; attemptId: string; randomSeed: string; trials: TrialRecord[]; focusLossCount: number; focusLossTotal?: number; fullscreenExitCount?: number; storageRecoveryUsed: boolean; }

export async function saveDraft(key: string, draft: RunDraft): Promise<boolean> {
  const db = await openDb();
  if (!db) { memory.set(key, draft); return false; }
  return new Promise((resolve) => {
    const tx = db.transaction(RUN_STORE, "readwrite"); tx.objectStore(RUN_STORE).put(draft, key); tx.oncomplete = () => resolve(true); tx.onerror = () => { memory.set(key, draft); resolve(false); };
  });
}

export async function loadDraft(key: string): Promise<RunDraft | null> {
  const db = await openDb();
  if (!db) return (memory.get(key) as RunDraft | undefined) ?? null;
  return new Promise((resolve) => { const request = db.transaction(RUN_STORE, "readonly").objectStore(RUN_STORE).get(key); request.onsuccess = () => resolve((request.result as RunDraft | undefined) ?? null); request.onerror = () => resolve(null); });
}

export async function deleteDraft(key: string): Promise<void> {
  memory.delete(key); const db = await openDb(); if (!db) return; await new Promise<void>((resolve) => { const tx = db.transaction(RUN_STORE, "readwrite"); tx.objectStore(RUN_STORE).delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
}

export async function saveResult(bundle: ResultBundle): Promise<boolean> {
  const db = await openDb();
  if (!db) { memory.set(`result:${LATEST_RESULT_KEY}`, bundle); return false; }
  return new Promise((resolve) => {
    const tx = db.transaction(RESULT_STORE, "readwrite");
    tx.objectStore(RESULT_STORE).put(bundle, LATEST_RESULT_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => { memory.set(`result:${LATEST_RESULT_KEY}`, bundle); resolve(false); };
  });
}

export async function loadLatestResult(): Promise<ResultBundle | null> {
  const db = await openDb();
  if (!db) return (memory.get(`result:${LATEST_RESULT_KEY}`) as ResultBundle | undefined) ?? null;
  return new Promise((resolve) => {
    const request = db.transaction(RESULT_STORE, "readonly").objectStore(RESULT_STORE).get(LATEST_RESULT_KEY);
    request.onsuccess = () => resolve((request.result as ResultBundle | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}
