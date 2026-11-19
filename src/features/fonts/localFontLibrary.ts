import { useEffect, useState } from "react";

export interface LocalFontRecord {
  id: string;
  ownerId: string;
  name: string;
  family: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: ArrayBuffer;
  createdAt: string;
}

export interface LocalFontSummary {
  id: string;
  ownerId: string;
  name: string;
  family: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

const DB_NAME = "vb-local-fonts-v1";
const STORE_NAME = "fonts";
const CHANGE_EVENT = "vb:local-fonts-changed";
export const MAX_LOCAL_FONT_BYTES = 15 * 1024 * 1024;
export const MAX_LOCAL_FONTS_PER_ACCOUNT = 12;

const loadedFamilies = new Set<string>();

function openFontDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持本地字体存储（IndexedDB）。"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("ownerId", "ownerId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("无法打开本地字体库。"));
  });
}

function sanitizeFontDisplayName(fileName: string): string {
  const base = fileName.replace(/\.(woff2?|ttf|otf)$/i, "").trim();
  return base.slice(0, 36) || "自定义字体";
}

function makeCssFamilyName(id: string): string {
  return `VBLocalFont_${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
}

async function registerFontFaceInDocument(record: LocalFontRecord): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  if (loadedFamilies.has(record.family)) return;
  const face = new FontFace(record.family, record.buffer.slice(0));
  const loaded = await face.load();
  document.fonts.add(loaded);
  loadedFamilies.add(record.family);
}

function notifyChanged(ownerId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ownerId } }));
  }
}

export async function listAccountLocalFonts(
  ownerId: string,
): Promise<LocalFontSummary[]> {
  try {
    const db = await openFontDb();
    return await new Promise<LocalFontSummary[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const idx = tx.objectStore(STORE_NAME).index("ownerId");
      const req = idx.getAll(ownerId || "local-guest");
      req.onsuccess = () => {
        const records = (req.result as LocalFontRecord[]) ?? [];
        const summaries = records
          .map(({ id, ownerId: oid, name, family, fileName, sizeBytes, createdAt }) => ({
            id,
            ownerId: oid,
            name,
            family,
            fileName,
            sizeBytes,
            createdAt,
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        resolve(summaries);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function hydrateAccountLocalFonts(ownerId: string): Promise<LocalFontSummary[]> {
  try {
    const db = await openFontDb();
    const records = await new Promise<LocalFontRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const idx = tx.objectStore(STORE_NAME).index("ownerId");
      const req = idx.getAll(ownerId || "local-guest");
      req.onsuccess = () => resolve((req.result as LocalFontRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    for (const record of records) {
      try {
        await registerFontFaceInDocument(record);
      } catch {
        // Skip corrupted font binary gracefully.
      }
    }
    return records
      .map(({ id, ownerId: oid, name, family, fileName, sizeBytes, createdAt }) => ({
        id,
        ownerId: oid,
        name,
        family,
        fileName,
        sizeBytes,
        createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function importLocalFontFile(
  ownerId: string,
  file: File,
): Promise<LocalFontSummary> {
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) {
    throw new Error("仅支持导入 .ttf、.otf、.woff 或 .woff2 字体文件。");
  }
  if (file.size <= 0 || file.size > MAX_LOCAL_FONT_BYTES) {
    throw new Error("字体文件大小需在 15 MiB 以内。");
  }
  const existing = await listAccountLocalFonts(ownerId);
  if (existing.length >= MAX_LOCAL_FONTS_PER_ACCOUNT) {
    throw new Error(`每个账号最多导入 ${MAX_LOCAL_FONTS_PER_ACCOUNT} 个本地字体，请先删除不需要的字体。`);
  }

  const buffer = await file.arrayBuffer();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `font-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const family = makeCssFamilyName(id);
  const record: LocalFontRecord = {
    id,
    ownerId: ownerId || "local-guest",
    name: sanitizeFontDisplayName(file.name),
    family,
    fileName: file.name,
    mimeType: file.type || "font/ttf",
    sizeBytes: file.size,
    buffer,
    createdAt: new Date().toISOString(),
  };

  try {
    await registerFontFaceInDocument(record);
  } catch {
    throw new Error("浏览器无法解析此字体文件，请确认文件完整有效。");
  }

  const db = await openFontDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("字体保存失败。"));
  });

  notifyChanged(record.ownerId);
  return {
    id: record.id,
    ownerId: record.ownerId,
    name: record.name,
    family: record.family,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
  };
}

export async function deleteLocalFont(ownerId: string, id: string): Promise<void> {
  const db = await openFontDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("删除字体失败。"));
  });
  notifyChanged(ownerId || "local-guest");
}

export function formatFontSizeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function useAccountLocalFonts(ownerId: string) {
  const [fonts, setFonts] = useState<LocalFontSummary[]>([]);

  useEffect(() => {
    let active = true;
    const sync = () => {
      void hydrateAccountLocalFonts(ownerId).then((items) => {
        if (active) setFonts(items);
      });
    };
    sync();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId?: string }>).detail;
      if (!detail?.ownerId || detail.ownerId === (ownerId || "local-guest")) {
        sync();
      }
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [ownerId]);

  return fonts;
}
