/**
 * Microsoft Graph drive items: bounded crawling, folder ranking, result
 * formatting and fan-out of n8n binary attachments.
 */

export const DEFAULT_MAX_ITERATIONS = 50;

/**
 * @typedef {{ pendingFolders: string[], collectedFiles: any[], iterations: number }} CrawlState
 */

/** @param {string} folderId @returns {CrawlState} */
export function createCrawlState(folderId) {
  return { pendingFolders: [folderId], collectedFiles: [], iterations: 0 };
}

/**
 * Pops the next folder or reports completion. `hitLimit` tells the caller
 * the traversal stopped with folders still pending.
 * @param {Partial<CrawlState>} state
 * @param {{ maxIterations?: number }} [options]
 */
export function takeNextFolder(state, { maxIterations = DEFAULT_MAX_ITERATIONS } = {}) {
  const pending = state.pendingFolders ?? [];
  const collected = state.collectedFiles ?? [];
  const iterations = state.iterations ?? 0;
  if (pending.length === 0 || iterations >= maxIterations) {
    return { done: /** @type {const} */ (true), collectedFiles: collected, hitLimit: iterations >= maxIterations && pending.length > 0, iterationsUsed: iterations };
  }
  return { done: /** @type {const} */ (false), currentFolderId: pending[0], pendingFolders: pending.slice(1), collectedFiles: collected, iterations: iterations + 1 };
}

/**
 * Adds a folder's children: files are collected, subfolders queued.
 * @param {Partial<CrawlState>} state
 * @param {any[]} children drive items
 * @returns {CrawlState}
 */
export function mergeChildren(state, children) {
  const items = children ?? [];
  return {
    pendingFolders: [...(state.pendingFolders ?? []), ...items.filter((i) => i.folder).map((i) => i.id)],
    collectedFiles: [...(state.collectedFiles ?? []), ...items.filter((i) => i.file)],
    iterations: state.iterations ?? 0,
  };
}

/**
 * Scores folder candidates against a folder hint: exact name 20, full path
 * contains the hint 10, each term in the name 4, in the path 1.
 * @param {any[]} items drive items
 * @param {unknown} folderQuery
 */
export function rankFolders(items, folderQuery) {
  const query = String(folderQuery ?? "").toLowerCase();
  const terms = query.replace(/[,./\\]/g, " ").split(/\s+/).filter((t) => t.length > 1);
  return (items ?? [])
    .filter((item) => item.folder || (!item.file && item.size === 0))
    .map((folder) => {
      const name = String(folder.name ?? "").toLowerCase();
      const path = String(folder.parentReference?.path ?? "").toLowerCase();
      const fullPath = `${path}/${name}`;
      let score = 0;
      if (name === query) score += 20;
      if (fullPath.includes(query)) score += 10;
      for (const term of terms) {
        if (name.includes(term)) score += 4;
        if (path.includes(term)) score += 1;
      }
      return { id: folder.id, name: folder.name, path: folder.parentReference?.path ?? "", score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Extension groups a user may ask for by name. */
export const FILE_TYPE_GROUPS = Object.freeze({
  image: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "heif"],
  pdf: ["pdf"],
  email: ["msg", "eml"],
  msg: ["msg", "eml"],
  text: ["txt", "log"],
  txt: ["txt", "log"],
  excel: ["xlsx", "xls", "xlsm", "csv"],
  word: ["docx", "doc"],
});

/** @param {unknown} fileName */
function extensionOf(fileName) {
  return String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Keeps files only, filtered to a type group when one is given.
 * @param {any[]} items
 * @param {unknown} fileType
 */
export function filterFilesByType(items, fileType) {
  const files = (items ?? []).filter((item) => item.file);
  const key = String(fileType ?? "").toLowerCase().trim();
  const allowed = /** @type {Record<string, readonly string[]>} */ (FILE_TYPE_GROUPS)[key];
  if (!allowed) return files;
  return files.filter((item) => allowed.includes(extensionOf(item.name)));
}

/**
 * @param {any[]} items
 * @param {unknown} fileType
 */
export function formatFileResults(items, fileType) {
  const files = filterFilesByType(items, fileType).map((item) => ({
    name: item.name,
    itemId: item.id,
    driveId: item.parentReference?.driveId,
    webUrl: item.webUrl,
    size: item.size || 0,
    lastModifiedDateTime: item.lastModifiedDateTime,
    parentPath: item.parentReference?.path || "",
  }));
  return {
    totalResults: files.length,
    files,
    message: files.length ? `Found ${files.length} matching file${files.length === 1 ? "" : "s"}.` : `No ${fileType || ""} files found.`.trim(),
  };
}

/** @type {Record<string, number>} */
const UNITS = { b: 1, kb: 1000, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };

/**
 * n8n reports binary sizes as numbers or human strings ("27.7 kB"). Returns
 * bytes, or null when unreadable.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseFileSize(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const m = /^\s*([\d.,]+)\s*([a-zA-Z]*)\s*$/.exec(value);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const unit = UNITS[m[2].toLowerCase() || "b"];
  if (!Number.isFinite(n) || unit === undefined) return null;
  return Math.round(n * unit);
}

/**
 * One item per binary attachment, each carrying the binary under the key
 * `data` so one upload node serves them all. Size comes from n8n's own
 * `fileSize`, never from the base64 payload. Items without binaries
 * contribute nothing.
 * @param {any[]} items n8n items
 * @param {{ folderId?: string, carry?: string[] }} [options] json fields to copy onto every attachment
 */
export function binaryFanOut(items, { folderId, carry = [] } = {}) {
  /** @type {{ json: Record<string, any>, binary: { data: any } }[]} */
  const out = [];
  for (const item of items ?? []) {
    const binary = item?.binary;
    if (!binary || typeof binary !== "object") continue;
    const json = item.json ?? {};
    for (const [key, data] of Object.entries(binary)) {
      /** @type {Record<string, any>} */
      const carried = {};
      for (const field of carry) carried[field] = json[field];
      out.push({
        json: {
          attachmentName: data?.fileName || key,
          mimeType: data?.mimeType || "application/octet-stream",
          fileSize: parseFileSize(data?.fileSize),
          folderId: folderId ?? json.folderId ?? null,
          ...carried,
        },
        binary: { data },
      });
    }
  }
  return out;
}
