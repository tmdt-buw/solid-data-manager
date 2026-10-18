// Copy only a successful version and never overwrite an existing destination.
// An unchanged name is a no-op, including percent-encoded filenames.
export async function renameResource({ url, parentUrl, name, fetcher, write, remove, reload }) {
  const trimmed = String(name || "").trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/\u0000-\u001f]/.test(trimmed))
    throw new Error("Invalid file name.");
  const source = new URL(url);
  const parent = new URL(parentUrl);
  if (source.origin !== parent.origin || new URL(".", source).href !== parent.href)
    throw new Error("Invalid rename source.");
  const target = new URL(encodeURIComponent(trimmed), parent).href;
  if (target === source.href || decodeURIComponent(target) === decodeURIComponent(source.href)) return false;
  if (source.pathname.endsWith("/")) throw new Error("Rename failed.");
  const response = await fetcher(source.href, { redirect: "error" });
  if (!response.ok) throw new Error("Rename failed.");
  const etag = response.headers.get("ETag");
  if (!etag || etag.startsWith("W/")) throw new Error("Rename failed.");
  const exists = await fetcher(target, { method: "HEAD", redirect: "error" });
  if (exists.status !== 404) throw new Error("The target already exists or cannot be checked.");
  const data = await response.blob();
  await write(target, data, {
    contentType: response.headers.get("Content-Type") || "application/octet-stream",
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers);
      if ((init.method || "GET").toUpperCase() === "PUT") headers.set("If-None-Match", "*");
      return fetcher(input, { ...init, redirect: "error", headers });
    },
  });
  await remove(source.href, { fetch: (input, init = {}) => {
    const headers = new Headers(init.headers);
    if ((init.method || "GET").toUpperCase() === "DELETE") headers.set("If-Match", etag);
    return fetcher(input, { ...init, redirect: "error", headers });
  } });
  await reload(parent.href);
  return true;
}
