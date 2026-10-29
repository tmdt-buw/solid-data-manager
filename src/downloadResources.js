import { getSolidDataset, getContainedResourceUrlAll } from "@inrupt/solid-client";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

// Bound browser memory and traversal. File bodies are compressed incrementally.
const DEFAULT_LIMITS = { bytes: 256 * 1024 * 1024, entries: 10000, depth: 64 };
const EMPTY = new Uint8Array(0);

function failure(code, resourceUrl, status) {
  return Object.assign(new Error(code), { code, resourceUrl, status });
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
}

function pathPart(value) {
  let name;
  try { name = decodeURIComponent(value); } catch { throw failure("UNSAFE_DOWNLOAD_REFERENCE"); }
  const unsafeCharacter = [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "/" || char === "\\");
  if (!name || name === "." || name === ".." || unsafeCharacter) {
    throw failure("UNSAFE_DOWNLOAD_REFERENCE");
  }
  return name;
}

function resourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw failure("UNSAFE_DOWNLOAD_REFERENCE"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw failure("UNSAFE_DOWNLOAD_REFERENCE");
  }
  url.pathname.split("/").filter(Boolean).forEach(pathPart);
  return url;
}

export function downloadName(value) {
  const url = resourceUrl(value);
  return pathPart(url.pathname.split("/").filter(Boolean).pop() || "Pod");
}

function descendant(parent, child) {
  return child.origin === parent.origin && child.pathname !== parent.pathname &&
    child.pathname.startsWith(parent.pathname);
}

export function saveDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Keep the Blob alive until the browser has consumed the click (also Safari).
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export async function downloadFileBlob(url, { fetch, signal }) {
  checkAbort(signal);
  const response = await fetch(url, { signal });
  if (!response.ok) throw failure("DOWNLOAD_HTTP_ERROR", url, response.status);
  const blob = await response.blob();
  checkAbort(signal);
  return blob;
}

export async function createFolderArchive(urls, {
  fetch, signal, onProgress = () => {}, limits: overrides = {},
}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  const selected = [...new Set(urls.map(url => resourceUrl(url).href))].map(resourceUrl);
  const roots = selected.filter(url => !selected.some(parent =>
    parent.pathname.endsWith("/") && descendant(parent, url)));
  if (!roots.length) throw failure("EMPTY_DOWNLOAD_SELECTION");

  const chunks = [], visited = new Set(), paths = new Set();
  let bytes = 0, archiveBytes = 0, files = 0, zipError = null, finished = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) { zipError = error; return; }
    archiveBytes += chunk.length;
    if (archiveBytes > limits.bytes) { zipError = failure("DOWNLOAD_TOO_LARGE"); return; }
    chunks.push(chunk);
    if (final) finished = true;
  });
  const ensureReady = () => {
    checkAbort(signal);
    if (zipError) throw zipError;
  };
  const report = (url) => onProgress({ files, bytes, current: downloadName(url) });

  async function visit(url, path, depth) {
    ensureReady();
    if (visited.has(url.href)) return;
    if (depth > limits.depth || visited.size >= limits.entries) throw failure("DOWNLOAD_TOO_LARGE", url.href);
    if (paths.has(path.replace(/\/$/, ""))) throw failure("DOWNLOAD_NAME_COLLISION", url.href);
    visited.add(url.href);
    paths.add(path.replace(/\/$/, ""));
    report(url.href);

    if (url.pathname.endsWith("/")) {
      const entry = new ZipPassThrough(path + "/");
      entry.attrs = 0x10;
      zip.add(entry);
      entry.push(EMPTY, true);
      ensureReady();
      const dataset = await getSolidDataset(url.href, { fetch: (input, init = {}) => fetch(input, { ...init, signal }) });
      ensureReady();
      for (const value of getContainedResourceUrlAll(dataset)) {
        const child = resourceUrl(value);
        if (!descendant(url, child)) throw failure("UNSAFE_DOWNLOAD_REFERENCE", child.href);
        const relative = child.pathname.slice(url.pathname.length).replace(/\/$/, "")
          .split("/").map(pathPart).join("/");
        await visit(child, path + "/" + relative, depth + 1);
      }
      return;
    }

    const response = await fetch(url.href, { signal });
    if (!response.ok) throw failure("DOWNLOAD_HTTP_ERROR", url.href, response.status);
    const reader = response.body?.getReader();
    if (!reader) throw failure("DOWNLOAD_STREAM_UNAVAILABLE", url.href);
    const entry = /\.(gz|zip|png|jpe?g|webp|mp[34]|pdf)$/i.test(path)
      ? new ZipPassThrough(path) : new ZipDeflate(path, { level: 3 });
    zip.add(entry);
    let complete = false;
    const cancelReader = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener("abort", cancelReader, { once: true });
    try {
      const declared = Number(response.headers.get("Content-Length"));
      if (Number.isFinite(declared) && declared > limits.bytes - bytes) throw failure("DOWNLOAD_TOO_LARGE", url.href);
      while (true) {
        ensureReady();
        const { done, value } = await reader.read();
        ensureReady();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limits.bytes) throw failure("DOWNLOAD_TOO_LARGE", url.href);
        for (let offset = 0; offset < value.length; offset += 65536) {
          entry.push(value.subarray(offset, offset + 65536), false);
          ensureReady();
          // Give rendering and the Cancel button time even for buffered responses.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        report(url.href);
      }
      entry.push(EMPTY, true);
      ensureReady();
      complete = true;
      files += 1;
      report(url.href);
    } finally {
      signal?.removeEventListener("abort", cancelReader);
      if (!complete) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  try {
    for (const url of roots) await visit(url, downloadName(url.href), 0);
    ensureReady();
    zip.end();
    ensureReady();
    if (!finished) throw failure("DOWNLOAD_ZIP_FAILED");
    return {
      blob: new Blob(chunks, { type: "application/zip" }),
      name: roots.length === 1 ? downloadName(roots[0].href) + ".zip" : "Pod-download.zip",
      files,
    };
  } finally {
    zip.terminate();
  }
}

export function downloadErrorMessage(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status) ||
    Number(String(error?.message || "").match(/\b([45]\d{2})\b/)?.[1]);
  if (status === 401) return "Authentication required (401). Please log in again.";
  if (status === 403) return "Download stopped: you do not have permission to read all selected files and folders.";
  if (status === 404) return "Download stopped: a file or folder no longer exists.";
  if (error?.code === "UNSAFE_DOWNLOAD_REFERENCE") return "Download stopped because a folder contains an invalid resource reference.";
  if (error?.code === "DOWNLOAD_TOO_LARGE") return "Download too large. Select fewer files or a smaller folder (up to 256 MiB and 10,000 entries).";
  if (error?.code === "DOWNLOAD_NAME_COLLISION") return "Download stopped because two resources have the same archive path.";
  if (error?.code === "DOWNLOAD_STREAM_UNAVAILABLE") return "Your browser cannot prepare this folder download. Please use a current browser.";
  return "Download failed. Please try again or check your connection.";
}
