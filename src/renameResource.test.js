import { Headers } from "node-fetch";
global.Headers = Headers;
import { renameResource } from "./renameResource";
const url = "https://pod.example/alice/report.txt", parentUrl = "https://pod.example/alice/";
function options(overrides = {}) {
  return { url, parentUrl, name: "renamed.txt", fetcher: jest.fn(async (target, init) =>
    init?.method === "HEAD" ? { status: 404 } : { ok: true, headers: { get: key => key === "ETag" ? '"v1"' : "text/plain" }, blob: async () => "content" }),
    write: jest.fn(async () => {}), remove: jest.fn(async () => {}), reload: jest.fn(async () => {}), ...overrides };
}
test("unchanged name never writes or deletes", async () => {
  const o = options({ name: "report.txt" }); await renameResource(o);
  expect(o.fetcher).not.toHaveBeenCalled(); expect(o.remove).not.toHaveBeenCalled();
});
test("a failed read never creates a file or deletes its source", async () => {
  const o = options({ fetcher: jest.fn(async () => ({ ok: false, status: 403 })) });
  await expect(renameResource(o)).rejects.toThrow(); expect(o.write).not.toHaveBeenCalled(); expect(o.remove).not.toHaveBeenCalled();
});
test("an existing target is never overwritten", async () => {
  const o = options(); const read = o.fetcher;
  o.fetcher = jest.fn((url, init) => init?.method === "HEAD" ? Promise.resolve({ status: 200 }) : read(url, init));
  await expect(renameResource(o)).rejects.toThrow(); expect(o.write).not.toHaveBeenCalled(); expect(o.remove).not.toHaveBeenCalled();
});
test("failed conditional creation never deletes the source", async () => {
  const o = options({ write: jest.fn(async () => { throw Error("412"); }) });
  await expect(renameResource(o)).rejects.toThrow("412"); expect(o.remove).not.toHaveBeenCalled();
});

test("creation and deletion are conditional on unchanged resources", async () => {
  const o = options();
  o.write = jest.fn(async (url, data, opts) => opts.fetch(url, { method: "PUT" }));
  o.remove = jest.fn(async (url, opts) => opts.fetch(url, { method: "DELETE" }));
  await renameResource(o);
  expect(o.fetcher.mock.calls.find(([,init]) => init?.method === "PUT")[1].headers.get("If-None-Match")).toBe("*");
  expect(o.fetcher.mock.calls.find(([,init]) => init?.method === "DELETE")[1].headers.get("If-Match")).toBe('"v1"');
  expect(o.reload).toHaveBeenCalledWith(parentUrl);
});
test("missing or weak source versions prevent unsafe deletion", async () => {
  for (const etag of [null, 'W/"v1"']) {
    const o = options({ fetcher: jest.fn(async () => ({ ok: true, headers: { get: () => etag } })) });
    await expect(renameResource(o)).rejects.toThrow();
    expect(o.write).not.toHaveBeenCalled(); expect(o.remove).not.toHaveBeenCalled();
  }
});
