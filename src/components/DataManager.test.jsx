import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createContainerAt,
  deleteContainer,
  deleteFile,
  getContainedResourceUrlAll,
  getSolidDataset,
  overwriteFile,
  saveAclFor,
} from "@inrupt/solid-client";
import session from "../solidSession";
import { translateText } from "../i18n";
import DataManager from "./DataManager";

jest.mock("@inrupt/solid-client", () => ({
  getSolidDataset: jest.fn(),
  getContainedResourceUrlAll: jest.fn(),
  deleteFile: jest.fn(),
  deleteContainer: jest.fn(),
  createContainerAt: jest.fn(),
  overwriteFile: jest.fn(),
  getFileWithAcl: jest.fn(),
  getSolidDatasetWithAcl: jest.fn(),
  getResourceAcl: jest.fn(),
  hasResourceAcl: jest.fn(),
  hasAccessibleAcl: jest.fn(),
  createAclFromFallbackAcl: jest.fn(),
  setAgentResourceAccess: jest.fn(),
  getAgentResourceAccessAll: jest.fn(),
  saveAclFor: jest.fn(),
}));

jest.mock("../solidSession", () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
}));

const WEB_ID = "https://pod.example/profile/card#me";
const ROOT_URL = "https://pod.example/";
const RESTRICTED_URL = `${ROOT_URL}restricted/`;

function datasetWith(...contained) {
  return { contained };
}

function mockHeadResponse() {
  return {
    headers: {
      get: jest.fn(() => null),
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function readBlobText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

async function confirmSelectedItemsDelete() {
  fireEvent.click(screen.getByTitle("Delete"));
  const confirmMessage = await screen.findByText(
    "This will permanently delete the selected items."
  );
  const confirmModal = confirmMessage.closest(".modal-box");
  fireEvent.click(within(confirmModal).getByRole("button", { name: "Delete" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  getContainedResourceUrlAll.mockImplementation((dataset) => dataset.contained || []);
  session.fetch.mockResolvedValue(mockHeadResponse());
});

test.each([
  [WEB_ID, ROOT_URL],
  ["https://server.example/solidtestpod/profile/card#me", "https://server.example/solidtestpod/"],
])("hides the internal statistics folder without accessing or modifying it for %s", async (webId, rootUrl) => {
  const statisticsUrl = `${rootUrl}statistics/`;
  const visibleFileUrl = `${rootUrl}statistics.json`;
  getSolidDataset.mockResolvedValue(datasetWith(
    statisticsUrl, statisticsUrl, `${rootUrl}documents/`, `${rootUrl}statistics-backup/`, visibleFileUrl
  ));

  render(<DataManager webId={webId} />);

  expect(await screen.findByRole("button", { name: "documents" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "statistics", exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "statistics-backup" })).toBeInTheDocument();
  expect(screen.getByText("statistics.json")).toBeInTheDocument();
  expect(getSolidDataset).toHaveBeenCalledTimes(1);
  expect(getSolidDataset).toHaveBeenCalledWith(rootUrl, expect.any(Object));
  expect(session.fetch).toHaveBeenCalledTimes(1);
  expect(session.fetch).toHaveBeenCalledWith(visibleFileUrl, expect.objectContaining({ method: "HEAD" }));
  expect(createContainerAt).not.toHaveBeenCalled();
  expect(overwriteFile).not.toHaveBeenCalled();
  expect(deleteFile).not.toHaveBeenCalled();
  expect(deleteContainer).not.toHaveBeenCalled();
  expect(saveAclFor).not.toHaveBeenCalled();
});

test("keeps user statistics subfolders navigable without folder HEAD requests", async () => {
  const documentsUrl = `${ROOT_URL}documents/`;
  const userStatisticsUrl = `${documentsUrl}statistics/`;
  const fileUrl = `${userStatisticsUrl}report.txt`;
  getSolidDataset.mockImplementation(async (url) => {
    if (url === ROOT_URL) return datasetWith(`${ROOT_URL}statistics/`, documentsUrl);
    if (url === documentsUrl) return datasetWith(userStatisticsUrl);
    if (url === userStatisticsUrl) return datasetWith(fileUrl);
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<DataManager webId={WEB_ID} />);
  fireEvent.click(await screen.findByRole("button", { name: "documents" }));
  fireEvent.click(await screen.findByRole("button", { name: "statistics", exact: true }));
  expect(await screen.findByText("report.txt")).toBeInTheDocument();
  expect(session.fetch).toHaveBeenCalledTimes(1);
  expect(session.fetch).toHaveBeenCalledWith(fileUrl, expect.objectContaining({ method: "HEAD" }));
});

test("finishes loading when only the hidden statistics folder exists", async () => {
  getSolidDataset.mockResolvedValue(datasetWith(`${ROOT_URL}statistics/`));
  render(<DataManager webId={WEB_ID} />);

  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "statistics", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(session.fetch).not.toHaveBeenCalled();
});

test("preserves file metadata while omitting folder metadata requests", async () => {
  const fileUrl = `${ROOT_URL}notes.txt`;
  getSolidDataset.mockResolvedValue(datasetWith(`${ROOT_URL}documents/`, fileUrl));
  session.fetch.mockResolvedValue({
    headers: { get: (header) => ({
      "Content-Length": "123",
      "Last-Modified": "Sun, 06 Sep 2026 13:17:49 GMT",
    }[header] || null) },
  });

  render(<DataManager webId={WEB_ID} />);
  const row = (await screen.findByText("notes.txt")).closest("tr");
  expect(within(row).getByText("123 B")).toBeInTheDocument();
  expect(row).toHaveTextContent(new Date("Sun, 06 Sep 2026 13:17:49 GMT").toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }));
  expect(session.fetch).toHaveBeenCalledTimes(1);
  expect(session.fetch).toHaveBeenCalledWith(fileUrl, expect.objectContaining({ method: "HEAD" }));
});

test("translates the application loading copy", () => {
  expect(translateText("Solid Data Manager", "de")).toBe("Solid Datenmanager");
  expect(translateText("Loading your personal Pod workspace …", "de")).toBe(
    "Dein persönlicher Pod-Bereich wird geladen …"
  );
  expect(translateText("File preview", "de")).toBe("Dateivorschau");
  expect(translateText("Loading your personal file preview …", "de")).toBe(
    "Deine persönliche Dateivorschau wird geladen …"
  );
});

test("exposes the file-list loading state to assistive technology", async () => {
  const request = deferred();
  getSolidDataset.mockReturnValue(request.promise);

  const { container } = render(<DataManager webId={WEB_ID} />);

  const heading = await screen.findByRole("heading", {
    name: "Solid Data Manager",
    level: 1,
  });
  const loadingState = heading.closest(".sdm-content-loader");
  expect(loadingState?.tagName).toBe("MAIN");
  expect(loadingState).toHaveAttribute("aria-busy", "true");
  expect(loadingState).toHaveClass("sdm-content-loader--files");
  const status = within(loadingState).getByRole("status");
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(status).toHaveTextContent("Loading your personal Pod workspace …");
  expect(within(loadingState).getAllByRole("status")).toHaveLength(1);
  expect(within(loadingState).getByRole("progressbar")).toHaveAttribute(
    "aria-label",
    "Loading your personal Pod workspace …"
  );
  expect(container.querySelector(".sdm-content-loader__eyebrow"))
    .not.toBeInTheDocument();

  await act(async () => {
    request.resolve(datasetWith());
    await request.promise;
  });

  await waitFor(() => {
    expect(
      screen.queryByRole("heading", { name: "Solid Data Manager", level: 1 })
    ).not.toBeInTheDocument();
  });
});

test("keeps preview metadata visible while exposing a compact preview loader", async () => {
  const fileUrl = `${ROOT_URL}notes.txt`;
  const previewRequest = deferred();
  getSolidDataset.mockResolvedValue(datasetWith(fileUrl));
  session.fetch.mockImplementation((_input, init = {}) => {
    if (init.method === "HEAD") return Promise.resolve(mockHeadResponse());
    return previewRequest.promise;
  });

  render(<DataManager webId={WEB_ID} />);

  const fileName = await screen.findByText("notes.txt");
  fireEvent.click(fileName.closest("tr"));
  fireEvent.click(screen.getByTitle("Preview"));

  const loadingState = await screen.findByRole("status");
  expect(loadingState).toHaveTextContent(
    "Loading your personal file preview …"
  );
  const previewModal = loadingState.closest(".preview-modal");
  expect(loadingState.closest(".sdm-content-loader")).toHaveClass(
    "sdm-content-loader--preview"
  );
  expect(within(previewModal).getByText("File preview")).toBeInTheDocument();
  expect(within(previewModal).getByText("Name:")).toBeInTheDocument();
  expect(within(previewModal).getByText("notes.txt")).toBeInTheDocument();

  await act(async () => {
    previewRequest.resolve({
      ok: true,
      text: jest.fn().mockResolvedValue("Preview content"),
    });
    await previewRequest.promise;
  });

  expect(await screen.findByText("Preview content")).toBeInTheDocument();
  expect(
    screen.queryByRole("status")
  ).not.toBeInTheDocument();
});

test("previews, edits, and saves the complete content of a large Turtle file", async () => {
  const fileUrl = `${ROOT_URL}latest.ttl`;
  const fullContent = `@prefix example: <https://example.com/>.\n<#resource> example:value "${"x".repeat(6000)}".\n# complete`;
  const editedContent = `${fullContent}\n# edited`;
  let storedContent = fullContent;
  let previewReads = 0;
  const previewRequest = deferred();
  const saveRequest = deferred();
  getSolidDataset.mockResolvedValue(datasetWith(fileUrl));
  session.fetch.mockImplementation((input, init = {}) => {
    expect(input).toBe(fileUrl);
    if (init.method === "HEAD") return Promise.resolve(mockHeadResponse());
    previewReads += 1;
    if (previewReads === 1) return previewRequest.promise;
    return Promise.resolve({
      ok: true,
      text: jest.fn().mockImplementation(() => Promise.resolve(storedContent)),
    });
  });
  overwriteFile.mockReturnValue(saveRequest.promise);

  const { container } = render(<DataManager webId={WEB_ID} />);

  const fileName = await screen.findByText("latest.ttl");
  fireEvent.click(fileName.closest("tr"));
  fireEvent.click(screen.getByTitle("Preview"));

  await act(async () => {
    previewRequest.resolve({
      ok: true,
      text: jest.fn().mockResolvedValue(fullContent),
    });
    await previewRequest.promise;
  });

  await waitFor(() => {
    expect(container.querySelector(".preview-code")).toHaveTextContent("# complete");
  });
  expect(container.querySelector(".preview-code")?.textContent).toBe(fullContent);

  fireEvent.click(screen.getByRole("button", { name: "Edit file" }));
  const editor = container.querySelector(".preview-editor");
  expect(editor).toHaveValue(fullContent);
  fireEvent.change(editor, { target: { value: editedContent } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(overwriteFile).toHaveBeenCalledTimes(1));
  const [savedUrl, savedBlob, options] = overwriteFile.mock.calls[0];
  expect(savedUrl).toBe(fileUrl);
  expect(options.contentType).toBe("text/turtle");
  expect(options.fetch).toEqual(expect.any(Function));
  expect(await readBlobText(savedBlob)).toBe(editedContent);
  storedContent = editedContent;
  await act(async () => {
    saveRequest.resolve();
    await saveRequest.promise;
  });
  await waitFor(() => {
    expect(previewReads).toBe(2);
    expect(container.querySelector(".preview-code")?.textContent).toBe(editedContent);
  });
});

test("keeps the parent breadcrumb and listing when opening a folder returns 403", async () => {
  getSolidDataset.mockImplementation((url) => {
    if (url === ROOT_URL) return Promise.resolve(datasetWith(RESTRICTED_URL));
    if (url === RESTRICTED_URL) return Promise.reject({ statusCode: 403 });
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const { container } = render(<DataManager webId={WEB_ID} />);

  fireEvent.click(await screen.findByRole("button", { name: "restricted" }));

  expect(
    await screen.findByText(
      "Access denied (403). You do not have permission to open this folder."
    )
  ).toBeInTheDocument();

  const breadcrumb = container.querySelector(".data-manager-main .crumb");
  expect(breadcrumb).toHaveTextContent("Pod root");
  expect(breadcrumb).not.toHaveTextContent("restricted");
  expect(screen.getByRole("button", { name: "restricted" })).toBeInTheDocument();
});

test("reports a static translatable message for an unexpected folder error", async () => {
  getSolidDataset.mockImplementation((url) => {
    if (url === ROOT_URL) return Promise.resolve(datasetWith(RESTRICTED_URL));
    if (url === RESTRICTED_URL) {
      return Promise.reject(new Error("Network connection lost"));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  render(<DataManager webId={WEB_ID} />);

  fireEvent.click(await screen.findByRole("button", { name: "restricted" }));

  expect(
    await screen.findByText(
      "Opening folder failed. Please try again or check your connection."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/Network connection lost/)).not.toBeInTheDocument();
});

test("ignores a stale folder response after the WebID changes", async () => {
  const nextWebId = "https://other-pod.example/profile/card#me";
  const nextRootUrl = "https://other-pod.example/";
  const nextItemUrl = `${nextRootUrl}current.txt`;
  const staleItemUrl = `${RESTRICTED_URL}stale.txt`;
  const staleRequest = deferred();

  getSolidDataset.mockImplementation((url) => {
    if (url === ROOT_URL) return Promise.resolve(datasetWith(RESTRICTED_URL));
    if (url === RESTRICTED_URL) return staleRequest.promise;
    if (url === nextRootUrl) return Promise.resolve(datasetWith(nextItemUrl));
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  const { rerender } = render(<DataManager webId={WEB_ID} />);
  fireEvent.click(await screen.findByRole("button", { name: "restricted" }));

  rerender(<DataManager webId={nextWebId} />);
  expect(await screen.findByText("current.txt")).toBeInTheDocument();

  await act(async () => {
    staleRequest.resolve(datasetWith(staleItemUrl));
    await staleRequest.promise;
  });

  expect(screen.getByText("current.txt")).toBeInTheDocument();
  expect(screen.queryByText("stale.txt")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Opening folder failed. Please try again or check your connection.")
  ).not.toBeInTheDocument();
});

test("does not delete a container when its contents cannot be read", async () => {
  getSolidDataset.mockImplementation((url) => {
    if (url === ROOT_URL) return Promise.resolve(datasetWith(RESTRICTED_URL));
    if (url === RESTRICTED_URL) {
      return Promise.reject({ response: { status: 403 } });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  render(<DataManager webId={WEB_ID} />);

  const folderName = await screen.findByText("restricted");
  fireEvent.click(folderName.closest("tr"));
  await confirmSelectedItemsDelete();

  expect(
    await screen.findByText(
      "Access denied (403). You do not have permission to delete the selected items."
    )
  ).toBeInTheDocument();
  await waitFor(() => {
    const rootReads = getSolidDataset.mock.calls.filter(([url]) => url === ROOT_URL);
    expect(rootReads).toHaveLength(2);
  });
  expect(deleteContainer).not.toHaveBeenCalled();
  expect(deleteFile).not.toHaveBeenCalled();
});

test("reloads the parent after a later item fails following a successful delete", async () => {
  const fileUrl = `${ROOT_URL}already-deleted.txt`;
  let rootReads = 0;
  getSolidDataset.mockImplementation((url) => {
    if (url === ROOT_URL) {
      rootReads += 1;
      return Promise.resolve(
        rootReads === 1
          ? datasetWith(fileUrl, RESTRICTED_URL)
          : datasetWith(RESTRICTED_URL)
      );
    }
    if (url === RESTRICTED_URL) return Promise.reject({ statusCode: 403 });
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  render(<DataManager webId={WEB_ID} />);

  const fileName = await screen.findByText("already-deleted.txt");
  const folderName = screen.getByText("restricted");
  fireEvent.click(fileName.closest("tr"));
  fireEvent.click(folderName.closest("tr"), { ctrlKey: true });
  await confirmSelectedItemsDelete();

  expect(
    await screen.findByText(
      "Access denied (403). You do not have permission to delete the selected items."
    )
  ).toBeInTheDocument();
  expect(deleteFile).toHaveBeenCalledWith(fileUrl, expect.any(Object));
  expect(rootReads).toBe(2);
  expect(screen.queryByText("already-deleted.txt")).not.toBeInTheDocument();
  expect(screen.getByText("restricted")).toBeInTheDocument();
});

test.each([
  ["another origin", "https://evil.example/secret.ttl"],
  ["a same-origin sibling", `${ROOT_URL}outside/secret.ttl`],
])("refuses to delete an ldp:contains target from %s", async (_label, unsafeUrl) => {
  getSolidDataset.mockImplementation((url) => {
    if (url === ROOT_URL) return Promise.resolve(datasetWith(RESTRICTED_URL));
    if (url === RESTRICTED_URL) return Promise.resolve(datasetWith(unsafeUrl));
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  render(<DataManager webId={WEB_ID} />);

  const folderName = await screen.findByText("restricted");
  fireEvent.click(folderName.closest("tr"));
  await confirmSelectedItemsDelete();

  expect(
    await screen.findByText(
      "Delete stopped because a folder contains an invalid resource reference."
    )
  ).toBeInTheDocument();
  expect(deleteFile).not.toHaveBeenCalled();
  expect(deleteContainer).not.toHaveBeenCalled();
});

test("uses the visited set to delete duplicate contained resources only once", async () => {
  const duplicateUrl = `${RESTRICTED_URL}duplicate.ttl`;
  getSolidDataset.mockImplementation((url) => {
    if (url === ROOT_URL) return Promise.resolve(datasetWith(RESTRICTED_URL));
    if (url === RESTRICTED_URL) {
      return Promise.resolve(datasetWith(duplicateUrl, duplicateUrl));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  render(<DataManager webId={WEB_ID} />);

  const folderName = await screen.findByText("restricted");
  fireEvent.click(folderName.closest("tr"));
  await confirmSelectedItemsDelete();

  await waitFor(() => {
    expect(deleteContainer).toHaveBeenCalledWith(RESTRICTED_URL, expect.any(Object));
  });
  expect(deleteFile).toHaveBeenCalledTimes(1);
  expect(deleteFile).toHaveBeenCalledWith(duplicateUrl, expect.any(Object));
  expect(deleteFile.mock.invocationCallOrder[0]).toBeLessThan(
    deleteContainer.mock.invocationCallOrder[0]
  );
});
