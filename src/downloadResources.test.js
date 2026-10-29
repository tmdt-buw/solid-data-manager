import { getSolidDataset, getContainedResourceUrlAll } from "@inrupt/solid-client";
import { strToU8, unzipSync } from "fflate";
import { createFolderArchive, downloadFileBlob, downloadName, downloadErrorMessage, saveDownload } from "./downloadResources";

jest.mock("@inrupt/solid-client", () => ({ getSolidDataset: jest.fn(), getContainedResourceUrlAll: jest.fn() }));
const ROOT = "https://pod.example/alice/";
const FOLDER = ROOT + "Messwerte/";
const headers = { get: () => null };
function response(bytes = strToU8("hello"), status = 200) {
  let i = 0;
  const reader = { read: jest.fn(async () => i++ === 0 ? { done: false, value: bytes } : { done: true }), cancel: jest.fn(async () => {}), releaseLock: jest.fn() };
  return { ok: status === 200, status, headers, body: { getReader: () => reader }, reader };
}
function asBytes(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  getContainedResourceUrlAll.mockImplementation(data => data.children);
  getSolidDataset.mockResolvedValue({ children: [] });
});

test("archives nested folders, empty folders, Unicode names and unchanged binary/Gzip bytes", async () => {
  const json = strToU8('{"temperature":21.5}');
  const gzip = new Uint8Array([31, 139, 8, 0, 255, 0, 128, 64]);
  const tree = { [FOLDER]: [FOLDER + "Gr%C3%BCne%20Daten/", FOLDER + "Leer/"], [FOLDER + "Gr%C3%BCne%20Daten/"]: [FOLDER + "Gr%C3%BCne%20Daten/data.json", FOLDER + "Gr%C3%BCne%20Daten/history.json.gz"] };
  getSolidDataset.mockImplementation(async url => ({ children: tree[url] || [] }));
  const fetch = jest.fn(async url => response(url.endsWith(".gz") ? gzip : json));
  const progress = jest.fn();
  const archive = await createFolderArchive([FOLDER], { fetch, onProgress: progress });
  const entries = unzipSync(await asBytes(archive.blob));
  expect(archive.name).toBe("Messwerte.zip");
  expect(archive.files).toBe(2);
  expect(Object.keys(entries)).toEqual(["Messwerte/", "Messwerte/Grüne Daten/", "Messwerte/Grüne Daten/data.json", "Messwerte/Grüne Daten/history.json.gz", "Messwerte/Leer/"]);
  expect(Array.from(entries["Messwerte/Grüne Daten/data.json"])).toEqual(Array.from(json));
  expect(Array.from(entries["Messwerte/Grüne Daten/history.json.gz"])).toEqual(Array.from(gzip));
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ files: 2 }));
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("deduplicates overlapping selections and includes loose files in a mixed archive", async () => {
  const file = FOLDER + "notes.txt";
  getSolidDataset.mockResolvedValue({ children: [file, file] });
  const fetch = jest.fn(async () => response());
  const archive = await createFolderArchive([file, FOLDER, FOLDER, ROOT + "readme.txt"], { fetch });
  expect(archive.name).toBe("Pod-download.zip");
  expect(Object.keys(unzipSync(await asBytes(archive.blob)))).toEqual(["Messwerte/", "Messwerte/notes.txt", "readme.txt"]);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([401, 403, 404, 500])("rejects an incomplete archive on HTTP %s", async status => {
  getSolidDataset.mockResolvedValue({ children: [FOLDER + "ok.txt", FOLDER + "failed.txt"] });
  const fetch = jest.fn(async url => response(strToU8("ok"), url.endsWith("failed.txt") ? status : 200));
  await expect(createFolderArchive([FOLDER], { fetch })).rejects.toMatchObject({ status });
});

test("propagates a nested container error without treating it as an empty folder", async () => {
  getSolidDataset.mockImplementation(async url => {
    if (url === FOLDER) return { children: [FOLDER + "restricted/"] };
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  });
  await expect(createFolderArchive([FOLDER], { fetch: jest.fn() })).rejects.toMatchObject({ statusCode: 403 });
  expect(downloadErrorMessage({ statusCode: 403 })).toMatch(/permission/);
});

test.each([
  "https://other.example/secret.txt", ROOT + "other/secret.txt", FOLDER,
  FOLDER + "%2e%2e/secret.txt", FOLDER + "bad%2Fname.txt", FOLDER + "bad%5Cname.txt",
  FOLDER + "bad%00name.txt", FOLDER + "file.txt?token=x", FOLDER + "file.txt#fragment",
])("rejects unsafe containment %s before fetching it", async url => {
  getSolidDataset.mockResolvedValue({ children: [url] });
  const fetch = jest.fn();
  await expect(createFolderArchive([FOLDER], { fetch })).rejects.toMatchObject({ code: "UNSAFE_DOWNLOAD_REFERENCE" });
  expect(fetch).not.toHaveBeenCalled();
});

test("rejects two distinct URLs that decode to the same ZIP path", async () => {
  getSolidDataset.mockResolvedValue({ children: [FOLDER + "a.txt", FOLDER + "%61.txt"] });
  await expect(createFolderArchive([FOLDER], { fetch: async () => response() })).rejects.toMatchObject({ code: "DOWNLOAD_NAME_COLLISION" });
});

test("stops a streaming response at the byte limit and releases its reader", async () => {
  const res = response(new Uint8Array(5000));
  getSolidDataset.mockResolvedValue({ children: [FOLDER + "large.bin"] });
  await expect(createFolderArchive([FOLDER], { fetch: async () => res, limits: { bytes: 2000 } })).rejects.toMatchObject({ code: "DOWNLOAD_TOO_LARGE" });
  expect(res.reader.cancel).toHaveBeenCalled();
  expect(res.reader.releaseLock).toHaveBeenCalled();
});

test.each([{ entries: 1 }, { depth: 0 }])("bounds traversal with %j", async limits => {
  getSolidDataset.mockResolvedValue({ children: [FOLDER + "nested/"] });
  await expect(createFolderArchive([FOLDER], { fetch: jest.fn(), limits })).rejects.toMatchObject({ code: "DOWNLOAD_TOO_LARGE" });
});

test("cancels an in-flight stream without producing an archive or reading the next file", async () => {
  const controller = new AbortController();
  getSolidDataset.mockResolvedValue({ children: [FOLDER + "first.txt", FOLDER + "second.txt"] });
  const res = response();
  res.reader.read.mockImplementation(async () => { controller.abort(); return { done: false, value: strToU8("partial") }; });
  const fetch = jest.fn(async () => res);
  await expect(createFolderArchive([FOLDER], { fetch, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(res.reader.cancel).toHaveBeenCalled();
});

test("preserves ordinary file downloads and rejects error pages", async () => {
  const blob = new Blob(["file"]);
  await expect(downloadFileBlob(ROOT + "file.txt", { fetch: async () => ({ ok: true, blob: async () => blob }) })).resolves.toBe(blob);
  await expect(downloadFileBlob(ROOT + "file.txt", { fetch: async () => response(undefined, 403) })).rejects.toMatchObject({ status: 403 });
  expect(downloadName(ROOT + "Gr%C3%BCne%20Datei.txt")).toBe("Grüne Datei.txt");
});

test("releases the download object URL after browser consumption", () => {
  jest.useFakeTimers();
  URL.createObjectURL = jest.fn(() => "blob:download");
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    saveDownload(new Blob(["file"]), "file.txt");
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
    expect(document.querySelector("a[download]")).toBeNull();
  } finally { click.mockRestore(); jest.useRealTimers(); }
});
