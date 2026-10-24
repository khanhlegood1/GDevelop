/**
 * GON — Browser Storage Adapter (IndexedDB)
 * ------------------------------------------------------------------
 * QUYẾT ĐỊNH PO 24/10/2026 (23:36, kèm screenshot):
 * "Trang Khám phá: phải mang dữ liệu từ thanh tìm kiếm qua cho đồng bộ
 *  tất cả dữ liệu. Chuyển sang dùng IndexedDB cho toàn bộ dự án này.
 *  Ghi vào tất cả tài liệu + code chính."
 *
 * → Toàn bộ dữ liệu phía client của GON lưu trong IndexedDB (thay cho
 * localStorage). localStorage chỉ còn vai trò: (a) fallback cho môi
 * trường không có IndexedDB, (b) nguồn migrate một lần cho dữ liệu cũ.
 * Xem docs/00-process/PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md.
 *
 * Demo tham chiếu đã triển khai: ux-prototype/standalone/index.html
 * (E2E 91/91 với fake-indexeddb, gồm test reload + persistence).
 */

/** Cấu hình kho IndexedDB chuẩn của GON (dùng chung toàn dự án). */
export const GON_BROWSER_DB = {
  name: "gon-web",
  version: 1,
  store: "app-state",
  key: "main",
} as const;

export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB không khả dụng"));
      return;
    }
    const req = indexedDB.open(GON_BROWSER_DB.name, GON_BROWSER_DB.version);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(GON_BROWSER_DB.store)) {
        req.result.createObjectStore(GON_BROWSER_DB.store);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Mở IndexedDB thất bại"));
    req.onblocked = () => reject(new Error("IndexedDB bị chặn bởi kết nối khác"));
  });
}

/** Đọc state đã lưu từ IndexedDB; null nếu chưa có. */
export async function readPersistedState<T>(): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const rq = db.transaction(GON_BROWSER_DB.store, "readonly")
        .objectStore(GON_BROWSER_DB.store)
        .get(GON_BROWSER_DB.key);
      rq.onsuccess = () => resolve((rq.result as T | undefined) ?? null);
      rq.onerror = () => reject(rq.error ?? new Error("Đọc IndexedDB thất bại"));
    });
  } finally {
    db.close();
  }
}

/** Ghi đè state vào IndexedDB. */
export async function writePersistedState<T>(state: T): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(GON_BROWSER_DB.store, "readwrite");
      tx.objectStore(GON_BROWSER_DB.store).put(state, GON_BROWSER_DB.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Ghi IndexedDB thất bại"));
      tx.onabort = () => reject(tx.error ?? new Error("Giao dịch IndexedDB bị huỷ"));
    });
  } finally {
    db.close();
  }
}

/** Xoá state đã lưu (luồng "xoá tài khoản & dữ liệu"). */
export async function clearPersistedState(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(GON_BROWSER_DB.store, "readwrite");
      tx.objectStore(GON_BROWSER_DB.store).delete(GON_BROWSER_DB.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Xoá IndexedDB thất bại"));
    });
  } finally {
    db.close();
  }
}

/**
 * Migrate một lần dữ liệu localStorage cũ sang IndexedDB.
 * Trả về dữ liệu đã migrate, hoặc null nếu không có dữ liệu cũ.
 */
export async function migrateFromLocalStorage<T>(legacyKey: string): Promise<T | null> {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    await writePersistedState(parsed);
    localStorage.removeItem(legacyKey); // xoá sau khi migrate thành công
    return parsed;
  } catch {
    return null;
  }
}
