import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AnswerMap } from "@/lib/checklist-logic";
import type { Position } from "@/lib/image";

// Offline draft storage for in-progress checklists (ARCHITECTURE §5.2). Answers
// auto-save to IndexedDB on every change so a dropped connection or closed tab
// never loses work. Photo blobs (plus the GPS captured with each batch, ADR-015)
// are held here until upload at submit, keyed by question id. Browser-only.

export type ChecklistDraft = {
  instanceId: string;
  answers: AnswerMap;
  // Compressed photo blobs awaiting upload-at-submit, per photo question.
  photos: Record<string, Blob[]>;
  // GPS captured at photo time, parallel to `photos` arrays (null = no fix).
  // Optional because pre-ADR-015 drafts lack it.
  photoPositions?: Record<string, (Position | null)[]>;
  // Client capture time (epoch ms) per photo, parallel to `photos` arrays.
  // Optional because older drafts lack it. iOS strips EXIF, so this is the
  // reliable capture time (ADR-021 photo metadata).
  photoTimestamps?: Record<string, (number | null)[]>;
  // Signature data URLs, per signature question.
  signatures: Record<string, string>;
  updatedAt: number;
};

interface DraftDB extends DBSchema {
  drafts: { key: string; value: ChecklistDraft };
}

const DB_NAME = "stayable-ops";
const STORE = "drafts";

let dbPromise: Promise<IDBPDatabase<DraftDB>> | null = null;

function getDb(): Promise<IDBPDatabase<DraftDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DraftDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "instanceId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadDraft(instanceId: string): Promise<ChecklistDraft | undefined> {
  const db = await getDb();
  return db.get(STORE, instanceId);
}

export async function saveDraft(draft: Omit<ChecklistDraft, "updatedAt">): Promise<void> {
  const db = await getDb();
  await db.put(STORE, { ...draft, updatedAt: Date.now() });
}

export async function clearDraft(instanceId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, instanceId);
}
