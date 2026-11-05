import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  getSolidDataset,
  getContainedResourceUrlAll,
  deleteFile,
  deleteContainer,
  createContainerAt,
  overwriteFile,
  getFileWithAcl,
  getSolidDatasetWithAcl,
  getResourceAcl,
  hasResourceAcl,
  hasAccessibleAcl,
  createAclFromFallbackAcl,
  setAgentResourceAccess,
  getAgentResourceAccessAll,
  saveAclFor,
} from "@inrupt/solid-client";
import session from "../solidSession";
import { uploadFileVerified, uploadErrorMessage } from "../uploadFiles";
import { uriFromSearch } from "../navigationTarget";
import { resolvePodNavigation, navigationErrorMessage } from "../podNavigation";
import { renameFolder, folderRenameTarget } from "../renameFolder";
import { createRenameJournal, downloadRenameBackup } from "../folderRenameBackup";
import { createRenameWorker } from "../folderRenameWorker";
import { renameResource } from "../renameResource";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFolder,
  faFile,
  faUpload,
  faPen,
  faTrash,
  faDownload,
  faShareNodes,
  faLink,
  faCheck,
  faChevronRight,
  faEye,
  faCopy,
  faRightFromBracket,
  faMagnifyingGlass,
  faFolderPlus,
  faFileCirclePlus,
  faFileCsv,
  faFileCode,
  faFileImage,
  faFilePdf,
} from "@fortawesome/free-solid-svg-icons";
import "./DataManager.css";
import CreateFolderModal from "./CreateFolderModal";
import ShareFileModal from "./ShareFileModal";
import RenameItemModal from "./RenameItemModal";
import AlertModal from "./AlertModal";
import ConfirmModal from "./ConfirmModal";
import { appVersion } from "../version";
import { useI18n } from "../i18n";
import { readCompressedJson } from "../readCompressedJson";
import { createFolderArchive, downloadFileBlob, downloadName, saveDownload, downloadErrorMessage } from "../downloadResources";

const noCacheFetch = (input, init = {}) =>
  session.fetch(input, {
    ...init,
    cache: "no-store",
    headers: (() => { const headers = new Headers(init.headers); headers.set("Cache-Control", "no-cache"); return headers; })()
  });

function getHttpStatus(error) {
  const candidates = [
    error?.statusCode,
    error?.status,
    error?.response?.status,
  ];
  const status = candidates
    .map((candidate) => Number(candidate))
    .find((candidate) => Number.isInteger(candidate) && candidate >= 100);
  if (status) return status;

  const match = String(error?.message || "").match(/\b([45]\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function formatResourceError(error, action) {
  const status = getHttpStatus(error);
  const isDelete = action === "delete";

  if (error?.code === "UNSAFE_CONTAINED_RESOURCE") {
    return "Delete stopped because a folder contains an invalid resource reference.";
  }

  if (status === 401) {
    return "Authentication required (401). Please log in again.";
  }
  if (status === 403) {
    return isDelete
      ? "Access denied (403). You do not have permission to delete the selected items."
      : "Access denied (403). You do not have permission to open this folder.";
  }
  if (status === 404) {
    return isDelete
      ? "Delete failed (404). An item no longer exists."
      : "Folder not found (404). It may have been moved or deleted.";
  }
  if (status === 409 && isDelete) {
    return "Delete failed (409). The folder may not be empty.";
  }

  return isDelete
    ? "Delete failed. Please try again."
    : "Opening folder failed. Please try again or check your connection.";
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function unsafeContainedResourceError() {
  const error = new Error("Unsafe ldp:contains resource reference.");
  error.code = "UNSAFE_CONTAINED_RESOURCE";
  return error;
}

function normalizeDeleteTarget(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw unsafeContainedResourceError();
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw unsafeContainedResourceError();
  }
  return parsed.href;
}

function validateContainedResourceUrl(containerUrl, resourceUrl) {
  const container = new URL(normalizeDeleteTarget(containerUrl));
  const resource = new URL(normalizeDeleteTarget(resourceUrl));
  const isStrictDescendant =
    resource.pathname !== container.pathname &&
    resource.pathname.startsWith(container.pathname);

  if (resource.origin !== container.origin || !isStrictDescendant) {
    throw unsafeContainedResourceError();
  }
  return resource.href;
}

function guessContentType(filename, fallback = "application/octet-stream") {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ttl":
      return "text/turtle";
    case "json":
      return "application/json";
    case "gz":
      return "application/gzip";
    case "csv":
      return "text/csv";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain";
    default:
      return fallback;
  }
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = units.shift();
  while (size >= 1024 && units.length) {
    size /= 1024;
    unit = units.shift();
  }
  return `${size.toFixed(size >= 10 || unit === "B" ? 0 : 1)} ${unit}`;
}

function getExtension(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function isEditablePreview(item) {
  if (!item) return false;
  const ext = getExtension(item.name);
  if (!ext) return true;
  return ["json", "csv", "txt", "ttl"].includes(ext);
}

function getItemType(item) {
  if (item.isFolder) return "Folder";
  if (item.name.toLowerCase().endsWith('.json.gz')) return 'JSON (Gzip)';
  const ext = getExtension(item.name);
  if (!ext) return "Other";
  if (["json", "csv", "ttl"].includes(ext)) return ext.toUpperCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "Image";
  return ext.toUpperCase();
}

function TopHeader({ headerUser, onLogout, headerLanguage }) {
  const showUser = headerUser && onLogout;
  const showHeaderVersion = !showUser;
  const podLabel = headerUser?.webId || headerUser?.podHost || "Pod";
  const displayName = headerUser?.name || "Solid Pod User";
  return (
    <div className="toolbar toolbar--title" data-standalone-header={showUser ? true : undefined}>
      <div className="crumb" data-standalone-brand={showUser ? true : undefined}>
        <FontAwesomeIcon icon={faFolder} className="crumb-icon" />
        <span translate="no">Solid <span className="crumb-highlight">Data</span> Manager</span>
      </div>
      <div className="toolbar-title-right" data-standalone-actions={showUser ? true : undefined}>
        {showUser ? (
          <div className="toolbar-user">
            <div className="toolbar-user-info" title={podLabel}>
              {headerUser.avatarUrl ? (
                <div className="toolbar-user-avatar">
                  <img src={headerUser.avatarUrl} alt="Profile" />
                </div>
              ) : null}
              <div className="toolbar-user-meta">
                <span className="toolbar-user-name" translate={headerUser.name ? "no" : undefined}>
                  {displayName}
                </span>
              </div>
            </div>
            {headerLanguage}
            <button className="toolbar-logout" type="button" onClick={onLogout}>
              <FontAwesomeIcon icon={faRightFromBracket} />
              <span>Logout</span>
            </button>
          </div>
        ) : null}
        {showHeaderVersion && <span className="toolbar-version">{appVersion}</span>}
      </div>
    </div>
  );
}

function ContentLoadingState({ variant = "files" }) {
  const { t } = useI18n();
  const isPreview = variant === "preview";
  const title = t(isPreview ? "File preview" : "Solid Data Manager");
  const message = t(
    isPreview
      ? "Loading your personal file preview …"
      : "Loading your personal Pod workspace …"
  );
  const Heading = isPreview ? "strong" : "h1";
  const Root = isPreview ? "div" : "main";

  return (
    <Root
      className={`sdm-content-loader sdm-content-loader--${variant}`}
      aria-busy="true"
    >
      <span className="sdm-content-loader__mark" aria-hidden="true">
        <FontAwesomeIcon icon={isPreview ? faEye : faFolder} />
      </span>
      <Heading className="sdm-content-loader__title">{title}</Heading>
      <p
        className="sdm-content-loader__message"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </p>
      <span
        className="sdm-content-loader__rail"
        role="progressbar"
        aria-label={message}
      >
        <span />
      </span>
    </Root>
  );
}

function fileVisual(item) {
  if (item.isFolder) return { icon: faFolder, tone: "folder" };
  const ext = getExtension(item.name);
  if (["csv", "xls", "xlsx"].includes(ext)) return { icon: faFileCsv, tone: "table" };
  if (["json", "jsonld", "ttl", "xml", "nt", "nq", "rdf"].includes(ext)) return { icon: faFileCode, tone: "code" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return { icon: faFileImage, tone: "image" };
  if (ext === "pdf") return { icon: faFilePdf, tone: "pdf" };
  return { icon: faFile, tone: "document" };
}

function FilesView({
  items, loading, uploadFile, navigateTo, crumbs, onRowSelect,
  onRowContextMenu, onDropOnFolder, onDragStartRow, searchQuery,
  onSearchQueryChange, selectedItems, onNewFolder, onNewFile, onHeaderAction, copiedUrl, downloading, ready, focusFile, uploadProgress, onCancelUpload,
}) {
  const { t, language } = useI18n();
  const tableRef = useRef(null);
  useEffect(() => {
    if (!focusFile || loading) return;
    const row = Array.from(tableRef.current?.querySelectorAll('[data-resource-url]') || [])
      .find(item => item.dataset.resourceUrl === focusFile);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [focusFile, items, loading]);
  const primary = items.find(item => selectedItems.has(item.url));
  const linkCopied = Boolean(primary && selectedItems.size === 1 && copiedUrl === primary.url);
  const selection = [
    { action: "preview", label: "Preview", icon: faEye, disabled: !primary || primary.isFolder },
    { action: "rename", label: "Rename", icon: faPen, disabled: !primary },
    { action: "download", label: "Download", icon: faDownload, disabled: !primary || downloading },
    { action: "copy-link", label: "Copy link", icon: linkCopied ? faCheck : faLink, disabled: selectedItems.size !== 1 || !primary || primary.isFolder },
    { action: "share", label: "Share", icon: faShareNodes, disabled: !primary },
    { action: "delete", label: "Delete", icon: faTrash, disabled: !primary },
  ];
  return (
    <>
      <div className="sdm-toolbar">
        <label className="sdm-search">
          <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
          <input type="search" aria-label={t("Search files...")} placeholder={t("Search files...")}
            value={searchQuery} onChange={event => onSearchQueryChange(event.target.value)} />
        </label>
        <div className="sdm-create-actions">
          <button type="button" onClick={onNewFolder} disabled={!ready} className="sdm-button" title={t("New folder")}>
            <FontAwesomeIcon icon={faFolderPlus} /><span>{t("New folder")}</span>
          </button>
          <button type="button" onClick={onNewFile} disabled={!ready} className="sdm-button" title={t("New file")}>
            <FontAwesomeIcon icon={faFileCirclePlus} /><span>{t("New file")}</span>
          </button>
          <button type="button" onClick={uploadFile} disabled={!ready || Boolean(uploadProgress)} className="sdm-button sdm-button--primary" title={t("Upload file")}>
            <FontAwesomeIcon icon={faUpload} /><span>{t("Upload")}</span>
          </button>
        </div>
      </div>
      {uploadProgress && <div className="sdm-upload-status" role="status" aria-live="polite">
        <progress aria-label={t(uploadProgress.phase)} />
        <span><strong>{t(uploadProgress.phase)}</strong> <span translate="no">{uploadProgress.name}</span> ({uploadProgress.index}/{uploadProgress.total})</span>
        <button type="button" className="sdm-button" onClick={onCancelUpload}>{t("Cancel")}</button>
      </div>}
      <div className="sdm-location-bar">
        <nav className="crumb sdm-breadcrumbs" aria-label={t("Folder navigation")}>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={crumb.url}>
              {index > 0 && <FontAwesomeIcon icon={faChevronRight} className="crumb-separator" aria-hidden="true" />}
              {index === crumbs.length - 1 ? (
                <span className="sdm-current-folder" aria-current="page" translate="no">{index === 0 && <FontAwesomeIcon icon={faFolder} />}{crumb.name}</span>
              ) : (
                <button type="button" className="crumb-link" translate="no" onClick={() => navigateTo(crumb.url)}>
                  {index === 0 && <FontAwesomeIcon icon={faFolder} />}{crumb.name}
                </button>
              )}
            </React.Fragment>
          ))}
        </nav>
        <span className="sdm-item-count"><strong>{items.length}</strong> {t(items.length === 1 ? "item" : "items")}</span>
      </div>
      <div className={`sdm-selection-bar${selectedItems.size ? " has-selection" : ""}`}>
        <span className="sdm-selection-caption" aria-live="polite">
          {linkCopied ? t("Link copied") : selectedItems.size ? <><strong>{selectedItems.size}</strong> {t("selected")}</> : t("Select files to manage them")}
        </span>
        <div className="header-actions" role="group" aria-label={t("File actions")}>
          {selection.map(({ action, label, icon, disabled }) => (
            <button key={action} type="button" className={`sdm-file-action${action === "delete" ? " sdm-file-action--danger" : ""}`}
              title={t(label)} aria-label={t(label)} onClick={() => onHeaderAction(action)} disabled={disabled}>
              <FontAwesomeIcon icon={icon} /><span>{t(label)}</span>
            </button>
          ))}
        </div>
      </div>
      {loading ? <ContentLoadingState /> : (
        <div className="file-table-container" ref={tableRef}>
          <table className="file-table" aria-label={t("Files and folders")}>
            <thead><tr><th scope="col">{t("Name")}</th><th scope="col">{t("Type")}</th><th scope="col">{t("Size")}</th><th scope="col">{t("Last Modified")}</th></tr></thead>
            <tbody>
              {items.map((item, index) => {
                const { url, lastModified, isFolder, name, size } = item;
                const visual = fileVisual(item);
                const selected = selectedItems.has(url);
                return (
                  <tr key={url} data-resource-url={url} draggable={!isFolder} className={selected ? "row-selected" : ""}
                    onDragStart={event => onDragStartRow(item, event)}
                    onContextMenu={event => onRowContextMenu(item, event)}
                    onDragOver={event => { if (isFolder) event.preventDefault(); }}
                    onDrop={event => { if (!isFolder) return; event.preventDefault(); onDropOnFolder(url, event); }}
                    onClick={event => { if (!event.target.closest("button, input, [role=button]")) onRowSelect(item, index, event); }}>
                    <td className="sdm-name-cell">
                      <div className="sdm-name-content">
                        <input className="sdm-select-item" type="checkbox" checked={selected} aria-label={`${t("Select")}: ${name}`} translate="no"
                          onChange={() => onRowSelect(item, index, { ctrlKey: true })} />
                        <span className={`sdm-file-symbol sdm-file-symbol--${visual.tone}`} aria-hidden="true"><FontAwesomeIcon icon={visual.icon} /></span>
                        <div className="sdm-file-copy">
                          {isFolder ? (
                            <button type="button" className="file-name-action file-name-action--folder" title={name} onClick={() => navigateTo(url)}>
                              <span className="file-name-text" translate="no">{name}</span>
                            </button>
                          ) : <span className="file-name-action" title={name}><span className="file-name-text" translate="no">{name}</span></span>}
                          <span className="sdm-mobile-meta">{t(getItemType(item))}{!isFolder && <>, {formatBytes(size)}</>}</span>
                        </div>
                        {isFolder && <FontAwesomeIcon icon={faChevronRight} className="sdm-folder-chevron" aria-hidden="true" />}
                      </div>
                    </td>
                    <td className="sdm-type-cell"><span className={`sdm-type-tag sdm-type-tag--${visual.tone}`}>{t(getItemType(item))}</span></td>
                    <td className="sdm-size-cell">{formatBytes(size)}</td>
                    <td className="sdm-date-cell">{lastModified ? new Date(lastModified).toLocaleString(language === "de" ? "de-DE" : "en-GB", {
                      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                    }) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && <div className="sdm-empty">
            <span className="sdm-file-symbol sdm-file-symbol--folder"><FontAwesomeIcon icon={searchQuery ? faMagnifyingGlass : faFolder} /></span>
            <h2>{t(searchQuery ? "No matching files" : "This folder is empty")}</h2>
            <p>{t(searchQuery ? "Try another search term." : "Upload a file or create a folder to get started.")}</p>
          </div>}
        </div>
      )}
    </>
  );
}

export default function DataManager({ webId, headerUser, onLogout, headerLanguage, uri }) {
  const { t } = useI18n();
  const [navigationSearch, setNavigationSearch] = useState(() => window.location.search);
  useEffect(() => {
    const update = () => setNavigationSearch(window.location.search);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const [currentUrl, setCurrentUrl] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [linkedFile, setLinkedFile] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const uploadControllerRef = useRef(null);
  useEffect(() => () => { uploadControllerRef.current?.abort(); }, [webId]);
  const downloadControllerRef = useRef(null);
  useEffect(() => () => downloadControllerRef.current?.abort(), [webId]);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewEditMode, setPreviewEditMode] = useState(false);
  const [previewEditableContent, setPreviewEditableContent] = useState("");
  const [previewSaving, setPreviewSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [moveCopyOpen, setMoveCopyOpen] = useState(false);
  const [moveCopyTarget, setMoveCopyTarget] = useState("");
  const [moveCopyMode, setMoveCopyMode] = useState(false);
  const [moveCopySources, setMoveCopySources] = useState([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTargetUrl, setShareTargetUrl] = useState("");
  const [shareAgents, setShareAgents] = useState([]);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetUrl, setRenameTargetUrl] = useState("");
  const [renameCurrentName, setRenameCurrentName] = useState("");
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [shareTargets, setShareTargets] = useState([]);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const rootUrlRef = useRef("");
  const [lastRenameBackup, setLastRenameBackup] = useState(null);
  const [renameProgress, setRenameProgress] = useState("");
  const [pendingRenames, setPendingRenames] = useState([]);
  const [resumeError, setResumeError] = useState("");
  const renameBusy = useRef(false);
  useEffect(() => { let active = true;
    setPendingRenames([]); setLastRenameBackup(null);
    createRenameJournal(webId).pending().then(rows => { if (active) setPendingRenames(rows); }).catch(() => {});
    return () => { active = false; };
  }, [webId]);
  useEffect(() => {
    const preventUnload = event => { if (renameBusy.current || uploadControllerRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, []);
  const lastSelectedIndexRef = useRef(null);
  const loadRequestIdRef = useRef(0);
  const loadAbortControllerRef = useRef(null);

  const showAlert = useCallback((msg) => {
    setAlertMessage(msg);
    setAlertOpen(true);
  }, []);

  useEffect(() => {
    if (!copiedLink) return undefined;
    const timer = window.setTimeout(() => setCopiedLink(null), 3000);
    return () => window.clearTimeout(timer);
  }, [copiedLink]);

  const copyFileLink = async (item) => {
    if (!item || item.isFolder) return;
    setCopiedLink(null);
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedLink({ url: item.url });
    } catch {
      showAlert(<>
        {t("Your browser could not copy the link automatically. Copy the URL below.")}
        <input type="text" className="form-control sdm-copy-link-url" value={item.url} readOnly autoFocus
          aria-label={t("File URL")} translate="no" onFocus={event => event.target.select()} />
      </>);
    }
  };

  const loadItems = useCallback(async (url, options = {}) => {
    const { commitUrl = false, reportError = true, focusFile = null } = options;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    loadAbortControllerRef.current?.abort();
    const controller = new AbortController();
    loadAbortControllerRef.current = controller;
    const requestFetch = (input, init = {}) =>
      noCacheFetch(input, { ...init, signal: controller.signal });
    const statisticsUrl = rootUrlRef.current
      ? new URL("statistics/", rootUrlRef.current).href
      : "";

    try {
      setLoading(true);
      setPreviewItem(null);
      setPreviewContent("");
      const dataset = await getSolidDataset(url, { fetch: requestFetch });
      const containedUrls = getContainedResourceUrlAll(dataset);
      // Hide the Pod's internal statistics folder before requesting metadata.
      // This is only a file-browser filter; no Pod data or access rules change.
      const allUrls = Array.from(new Set(containedUrls)).filter(
        (itemUrl) => itemUrl !== statisticsUrl
      );
      const itemInfos = await Promise.all(
        allUrls.map(async (itemUrl) => {
          const isFolder = itemUrl.endsWith("/");
          const name = decodeURIComponent(
            itemUrl.replace(url, "").replace(/\/$/, "")
          );
          const item = { url: itemUrl, lastModified: null, size: null, isFolder, name };
          // Folder navigation only needs the URL already in the container listing.
          // Avoid unnecessary HEAD requests to potentially protected containers.
          if (isFolder) return item;
          try {
            const res = await requestFetch(itemUrl, { method: "HEAD" });
            const sizeHeader = res.headers.get("Content-Length");
            const size = sizeHeader ? Number(sizeHeader) : null;
            return {
              ...item,
              lastModified: res.headers.get("Last-Modified"),
              size,
            };
          } catch {
            return item;
          }
        })
      );

      if (requestId !== loadRequestIdRef.current || controller.signal.aborted) {
        return false;
      }
      if (commitUrl) setCurrentUrl(url);
      setItems(itemInfos);
      const focused = focusFile ? itemInfos.find(item => item.url === focusFile && !item.isFolder) : null;
      setSelectedItems(new Set(focused ? [focused.url] : []));
      setLinkedFile(focused?.url || null);
      if (focusFile && !focused) showAlert("The linked file is not listed in this folder. It may have been moved or is not accessible.");
      lastSelectedIndexRef.current = null;
      return true;
    } catch (error) {
      const isCurrentRequest = requestId === loadRequestIdRef.current;
      if (
        reportError &&
        isCurrentRequest &&
        !controller.signal.aborted &&
        !isAbortError(error)
      ) {
        showAlert(formatResourceError(error, "open"));
      }
      return false;
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
        if (loadAbortControllerRef.current === controller) {
          loadAbortControllerRef.current = null;
        }
      }
    }
  }, [showAlert]);

  useEffect(() => {
    const controller = new AbortController();
    loadRequestIdRef.current += 1;
    loadAbortControllerRef.current?.abort();
    rootUrlRef.current = "";
    setCurrentUrl(""); setItems([]); setSelectedItems(new Set()); setLinkedFile(null);
    setPreviewItem(null); setPreviewContent(""); setSearchQuery("");
    setAlertOpen(false); setLoading(Boolean(webId));
    setFolderModalOpen(false); setNewFileOpen(false); setShareModalOpen(false);
    setRenameModalOpen(false); setMoveCopyOpen(false); setContextMenu(null); setBulkDeleteOpen(false);
    if (webId) {
      (async () => {
        const target = uri === undefined ? uriFromSearch(navigationSearch) : uri;
        const location = await resolvePodNavigation({ webId, uri: target, fetcher: noCacheFetch, signal: controller.signal });
        if (controller.signal.aborted) return;
        rootUrlRef.current = location.rootUrl;
        await loadItems(location.containerUrl, { commitUrl: true, focusFile: location.fileUrl });
      })().catch(error => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setLoading(false); showAlert(navigationErrorMessage(error));
        }
      });
    }
    return () => {
      controller.abort();
      loadRequestIdRef.current += 1;
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = null;
    };
  }, [webId, uri, navigationSearch, loadItems, showAlert]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [contextMenu]);

  const uploadFiles = useCallback(async (files) => {
    if (!currentUrl || !files.length || uploadControllerRef.current) return;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const outcomes = [];
    try {
      for (const [index, file] of Array.from(files).entries()) {
        if (controller.signal.aborted) break;
        const updatePhase = phase => setUploadProgress({ name: file.name, index: index + 1, total: files.length, phase });
        try {
          const result = await uploadFileVerified({ folderUrl: currentUrl, file,
            contentType: file.type || guessContentType(file.name), fetcher: noCacheFetch,
            signal: controller.signal, onPhase: updatePhase });
          outcomes.push({ name: file.name, message: result.verified ? "Upload completed and size verified." : "Upload completed, but its size could not be verified." });
        } catch (error) {
          if (controller.signal.aborted) break;
          outcomes.push({ name: file.name, message: uploadErrorMessage(error) });
        }
      }
      if (!controller.signal.aborted) {
        await loadItems(currentUrl);
        showAlert(<span className="sdm-upload-results">{outcomes.map((result, index) =>
          <span key={index}><strong translate="no">{result.name}</strong><br />{t(result.message)}</span>)}</span>);
      }
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
        setUploadProgress(null);
      }
    }
  }, [currentUrl, loadItems, showAlert, t]);

  const cancelUpload = () => {
    uploadControllerRef.current?.abort();
    showAlert("Upload cancelled. Files already completed are retained. Check the destination before trying again.");
    loadItems(currentUrl);
  };

  useEffect(() => {
    const preventDefaults = e => { e.preventDefault(); e.stopPropagation(); };
    const dropHandler = e => {
      preventDefaults(e);
      uploadFiles(Array.from(e.dataTransfer?.files || []));
    };
    ["dragenter", "dragover", "dragleave", "drop"].forEach(name => window.addEventListener(name, preventDefaults, false));
    window.addEventListener("drop", dropHandler);
    return () => {
      ["dragenter", "dragover", "dragleave", "drop"].forEach(name => window.removeEventListener(name, preventDefaults, false));
      window.removeEventListener("drop", dropHandler);
    };
  }, [uploadFiles]);

  const navigateTo = (url) => {
    if (uploadControllerRef.current) return;
    const nextUrl = url.endsWith("/") ? url : url + "/";
    setSelectedItems(new Set());
    lastSelectedIndexRef.current = null;
    setPreviewItem(null);
    loadItems(nextUrl, { commitUrl: true });
  };

  const computeCrumbs = () => {
    const rootUrl = rootUrlRef.current;
    if (!rootUrl || !currentUrl) return [];
    const url = new URL(currentUrl);
    const root = new URL(rootUrl);
    const relative = url.pathname.replace(root.pathname, "");
    const parts = relative.split("/").filter(Boolean);
    const rootPart = root.pathname.split("/").filter(Boolean).pop();
    let podName = rootPart || root.hostname.split(".")[0];
    try { podName = decodeURIComponent(podName); } catch { /* Keep malformed names readable. */ }
    const crumbs = [{ name: podName.replace(/[\\/]/g, ""), url: rootUrl }];
    parts.forEach((part, idx) => {
      const partUrl = rootUrl + parts.slice(0, idx + 1).join("/") + "/";
      crumbs.push({ name: decodeURIComponent(part), url: partUrl });
    });
    return crumbs;
  };

  const handleCreateFolder = async (name) => {
    if (!name) return;
    const folderUrl = currentUrl + name + "/";
    try {
      await createContainerAt(folderUrl, { fetch: noCacheFetch });
      await loadItems(currentUrl);
    } catch {
      showAlert("Failed to create folder.");
    }
  };

  const handleCreateFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    const fileUrl = currentUrl + name;
    try {
      const blob = new Blob([""], { type: guessContentType(name, "text/plain") });
      await overwriteFile(fileUrl, blob, {
        contentType: blob.type,
        fetch: noCacheFetch,
      });
      await loadItems(currentUrl);
    } catch {
      showAlert("Failed to create file.");
    } finally {
      setNewFileOpen(false);
      setNewFileName("");
    }
  };

  const savePreviewEdits = async () => {
    if (!previewItem || !isEditablePreview(previewItem)) return;
    setPreviewSaving(true);
    try {
      const contentType = guessContentType(previewItem.name, "text/plain");
      const blob = new Blob([previewEditableContent], { type: contentType });
      await overwriteFile(previewItem.url, blob, {
        contentType,
        fetch: noCacheFetch,
      });
      setPreviewContent(previewEditableContent);
      const updatedModified = new Date().toUTCString();
      setItems((prev) =>
        prev.map((item) =>
          item.url === previewItem.url
            ? {
                ...item,
                size: blob.size,
                lastModified: updatedModified,
              }
            : item
        )
      );
      setPreviewItem((prev) =>
        prev
          ? {
              ...prev,
              size: blob.size,
              lastModified: updatedModified,
            }
          : prev
      );
      setPreviewEditMode(false);
    } catch {
      showAlert("Failed to save file changes.");
    } finally {
      setPreviewSaving(false);
    }
  };

  const deleteRecursive = async (url, visited = new Set()) => {
    const deletionPlan = [];

    const collectDeletionPlan = async (candidateUrl) => {
      const normalizedUrl = normalizeDeleteTarget(candidateUrl);
      if (visited.has(normalizedUrl)) return;
      visited.add(normalizedUrl);

      if (normalizedUrl.endsWith("/")) {
        const dataset = await getSolidDataset(normalizedUrl, { fetch: noCacheFetch });
        const contained = getContainedResourceUrlAll(dataset);
        const safeContained = contained.map((item) =>
          validateContainedResourceUrl(normalizedUrl, item)
        );
        for (const item of safeContained) {
          await collectDeletionPlan(item);
        }
        deletionPlan.push({ url: normalizedUrl, isContainer: true });
        return;
      }

      deletionPlan.push({ url: normalizedUrl, isContainer: false });
    };

    await collectDeletionPlan(url);
    for (const item of deletionPlan) {
      if (item.isContainer) {
        await deleteContainer(item.url, { fetch: noCacheFetch });
      } else {
        await deleteFile(item.url, { fetch: noCacheFetch });
      }
    }
  };

  const openDeleteModal = (urls) => {
    const targets = Array.isArray(urls) ? urls : [urls];
    if (!targets.length) return;
    setBulkDeleteTargets(targets);
    setBulkDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!bulkDeleteTargets.length) return;
    let deleteError = null;
    try {
      const visited = new Set();
      for (const url of bulkDeleteTargets) {
        const safeTarget = validateContainedResourceUrl(currentUrl, url);
        await deleteRecursive(safeTarget, visited);
      }
    } catch (error) {
      deleteError = error;
    } finally {
      await loadItems(currentUrl, { reportError: !deleteError });
      if (deleteError) {
        showAlert(formatResourceError(deleteError, "delete"));
      }
      setBulkDeleteOpen(false);
      setBulkDeleteTargets([]);
    }
  };

  const openRenameModal = (url) => {
    const name = decodeURIComponent(url.replace(currentUrl, "").replace(/\/$/, ""));
    setRenameTargetUrl(url);
    setRenameCurrentName(name);
    setRenameModalOpen(true);
  };

  const performRename = async (url, newName, recovery = null) => {
    if (renameBusy.current) return;
    renameBusy.current = true; setResumeError("");
    try {
      if (url.endsWith("/")) {
        const target = recovery?.target || folderRenameTarget(url, currentUrl, newName, rootUrlRef.current);
        if (decodeURIComponent(target) === decodeURIComponent(url)) return;
        const journal = createRenameJournal(webId);
        const worker = await createRenameWorker(noCacheFetch, webId);
        if (worker.status.namespace && !url.startsWith(rootUrlRef.current + "connections/" + worker.status.namespace + "/")) throw Error("On Test, rename folders inside connections/test/ only.");
        const pending = await journal.pending();
        const record = recovery || pending.find(row => row.source === url && row.target === target);
        if (pending.some(row => row.id !== record?.id)) throw Error("Finish the pending folder rename first.");
        const completed = await renameFolder({ source: url, target, podRoot: rootUrlRef.current, webId, fetcher: noCacheFetch,
          journal, worker, record, onProgress: setRenameProgress });
        await loadItems(recovery ? new URL("..", target).href : currentUrl, { commitUrl: Boolean(recovery) });
        setLastRenameBackup(completed);
      } else {
        await renameResource({ url, parentUrl: currentUrl, name: newName,
          fetcher: noCacheFetch, write: overwriteFile, remove: deleteFile, reload: loadItems });
      }
    } catch (error) {
      if (error.partial) error.message = "Rename paused. Files and backup are retained. Use Resume rename to continue.";
      throw error;
    } finally {
      renameBusy.current = false; setRenameProgress("");
      createRenameJournal(webId).pending().then(setPendingRenames).catch(() => {});
    }
  };

  const handleRenameSubmit = async (newName) => {
    await performRename(renameTargetUrl, newName);
    setRenameModalOpen(false);
    setRenameTargetUrl("");
    setRenameCurrentName("");
  };

  const resumeRename = async record => {
    try { await performRename(record.source, "", record); }
    catch (error) { setResumeError(error.message); }
  };

  const uploadFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = event => uploadFiles(Array.from(event.target.files || []));
    input.click();
  };

  const downloadFiles = async (urls) => {
    if (!urls.length || downloadControllerRef.current) return;
    const controller = new AbortController();
    downloadControllerRef.current = controller;
    setDownloadProgress({ files: 0, bytes: 0, current: "" });
    try {
      if (urls.some(url => url.endsWith("/"))) {
        const archive = await createFolderArchive(urls, {
          fetch: noCacheFetch, signal: controller.signal, onProgress: setDownloadProgress,
        });
        if (!controller.signal.aborted) saveDownload(archive.blob, archive.name);
      } else {
        for (const [index, url] of urls.entries()) {
          setDownloadProgress({ files: index, bytes: 0, current: downloadName(url) });
          const blob = await downloadFileBlob(url, { fetch: noCacheFetch, signal: controller.signal });
          if (!controller.signal.aborted) saveDownload(blob, downloadName(url));
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) showAlert(downloadErrorMessage(error));
    } finally {
      if (downloadControllerRef.current === controller) {
        downloadControllerRef.current = null;
        setDownloadProgress(null);
      }
    }
  };

  const getResourceAndAcl = async (url) => {
    const resource = url.endsWith("/")
      ? await getSolidDatasetWithAcl(url, { fetch: noCacheFetch })
      : await getFileWithAcl(url, { fetch: noCacheFetch });
    let resourceAcl;
    if (!hasResourceAcl(resource)) {
      if (!hasAccessibleAcl(resource)) {
        throw new Error("No access to ACL.");
      }
      resourceAcl = createAclFromFallbackAcl(resource);
    } else {
      resourceAcl = getResourceAcl(resource);
    }
    return { resource, resourceAcl };
  };

  const loadShareAgents = (acl) => {
    const agentAccess = getAgentResourceAccessAll(acl);
    const agents = Object.entries(agentAccess)
      .filter(([agentWebId]) => agentWebId !== webId)
      .map(([agentWebId, access]) => ({
        webId: agentWebId,
        access,
      }));
    setShareAgents(agents);
  };

  const openShareModal = async (urls) => {
    const targets = Array.isArray(urls) ? urls : [urls];
    const primary = targets[0];
    if (!primary) return;
    try {
      const { resourceAcl } = await getResourceAndAcl(primary);
      loadShareAgents(resourceAcl);
      setShareTargetUrl(primary);
      setShareTargets(targets);
      setShareModalOpen(true);
    } catch {
      showAlert("Failed to load ACL.");
    }
  };

  const handleShareItem = async (webId, access) => {
    const targets = shareTargets.length ? shareTargets : shareTargetUrl ? [shareTargetUrl] : [];
    if (!targets.length) return;
    try {
      for (const url of targets) {
        const { resource, resourceAcl } = await getResourceAndAcl(url);
        const updatedAcl = setAgentResourceAccess(resourceAcl, webId, access);
        await saveAclFor(resource, updatedAcl, { fetch: noCacheFetch });
        if (url === targets[0]) {
          loadShareAgents(updatedAcl);
        }
      }
    } catch {
      showAlert("Sharing failed.");
    }
  };

  const handleRemoveShare = async (webId) => {
    const targets = shareTargets.length ? shareTargets : shareTargetUrl ? [shareTargetUrl] : [];
    if (!targets.length) return;
    try {
      for (const url of targets) {
        const { resource, resourceAcl } = await getResourceAndAcl(url);
        const updatedAcl = setAgentResourceAccess(resourceAcl, webId, {});
        await saveAclFor(resource, updatedAcl, { fetch: noCacheFetch });
        if (url === targets[0]) {
          loadShareAgents(updatedAcl);
        }
      }
    } catch {
      showAlert("Failed to remove access.");
    }
  };

  const loadPreview = useCallback(async (item) => {
    if (!item || item.isFolder) return;
    setPreviewLoading(true);
    try {
      const compressed = item.name.toLowerCase().endsWith('.json.gz');
      const res = await noCacheFetch(item.url, compressed ? { headers: { Accept: 'application/gzip, application/x-gzip, application/octet-stream, application/json' } } : {});
      if (!res.ok) throw new Error("Preview failed.");
      const ext = getExtension(item.name);
      if (compressed) {
        const text = JSON.stringify(await readCompressedJson(res), null, 2);
        setPreviewContent(text.length > 50000 ? text.slice(0, 50000) + '\n…' : text);
        setPreviewEditableContent('');
        setPreviewEditMode(false);
        return;
      }
      const text = await res.text();
      if (ext === "json") {
        try {
          const parsed = JSON.parse(text);
          setPreviewContent(JSON.stringify(parsed, null, 2));
          setPreviewEditableContent(JSON.stringify(parsed, null, 2));
        } catch {
          setPreviewContent(text);
          setPreviewEditableContent(text);
        }
      } else {
        const previewText = isEditablePreview(item) ? text : text.slice(0, 5000);
        setPreviewContent(previewText);
        setPreviewEditableContent(previewText);
      }
      setPreviewEditMode(false);
    } catch {
      setPreviewContent("No preview available.");
      setPreviewEditableContent("");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (previewItem) {
      loadPreview(previewItem);
    }
  }, [previewItem, loadPreview]);

  const normalizeFolderUrl = (url) => (url.endsWith("/") ? url : `${url}/`);

  const copyRecursive = async (srcUrl, destUrl) => {
    if (srcUrl.endsWith("/")) {
      await createContainerAt(destUrl, { fetch: noCacheFetch });
      const dataset = await getSolidDataset(srcUrl, { fetch: noCacheFetch });
      const contained = getContainedResourceUrlAll(dataset);
      for (const item of contained) {
        const name = decodeURIComponent(item.replace(srcUrl, "").replace(/\/$/, ""));
        const target = `${destUrl}${name}${item.endsWith("/") ? "/" : ""}`;
        await copyRecursive(item, target);
      }
    } else {
      const res = await noCacheFetch(srcUrl);
      const data = await res.blob();
      await overwriteFile(destUrl, data, {
        contentType: res.headers.get("Content-Type") || "application/octet-stream",
        fetch: noCacheFetch,
      });
    }
  };

  const moveOrCopyItems = async (urls, targetFolderUrl, copyMode) => {
    const target = normalizeFolderUrl(targetFolderUrl);
    try {
      for (const url of urls) {
        const safeSourceUrl = validateContainedResourceUrl(currentUrl, url);
        const trimmed = safeSourceUrl.replace(/\/$/, "");
        const name = decodeURIComponent(trimmed.split("/").pop() || "");
        const destUrl = `${target}${name}${safeSourceUrl.endsWith("/") ? "/" : ""}`;
        await copyRecursive(safeSourceUrl, destUrl);
        if (!copyMode) {
          await deleteRecursive(safeSourceUrl);
        }
      }
      await loadItems(currentUrl);
    } catch {
      showAlert("Move/Copy failed.");
    }
  };

  const filteredItems = items.filter((item) => {
    const nameLower = item.name.toLowerCase();
    const isHidden =
      nameLower.startsWith(".") ||
      nameLower.endsWith(".acl") ||
      nameLower.endsWith(".acr") ||
      nameLower.endsWith(".meta");
    if (isHidden && item.url !== linkedFile) return false;
    if (searchQuery && !nameLower.includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const sortedItems = filteredItems.slice().sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return (
    <>
      <TopHeader headerUser={headerUser} onLogout={onLogout} headerLanguage={headerLanguage} />
      <div className="data-manager-layout">
        <div className="data-manager-main">
          <FilesView
            items={sortedItems}
            loading={loading}
            ready={Boolean(currentUrl) && !loading}
            uploadFile={uploadFile}
            uploadProgress={uploadProgress}
            onCancelUpload={cancelUpload}
            navigateTo={navigateTo}
            crumbs={computeCrumbs()}
            onRowSelect={(item, index, event) => {
              const hasModifier = event.ctrlKey || event.metaKey;
              const isShift = event.shiftKey;
              setSelectedItems((prev) => {
                const next = new Set(prev);
                if (isShift && lastSelectedIndexRef.current !== null) {
                  const start = Math.min(lastSelectedIndexRef.current, index);
                  const end = Math.max(lastSelectedIndexRef.current, index);
                  for (let i = start; i <= end; i += 1) {
                    next.add(sortedItems[i].url);
                  }
                } else if (hasModifier) {
                  if (next.has(item.url)) next.delete(item.url);
                  else next.add(item.url);
                  lastSelectedIndexRef.current = index;
                } else {
                  if (next.has(item.url)) {
                    next.delete(item.url);
                    lastSelectedIndexRef.current = null;
                    return next;
                  }
                  next.clear();
                  next.add(item.url);
                  lastSelectedIndexRef.current = index;
                }
                return next;
              });
            }}
            onRowContextMenu={(item, event) => {
              event.preventDefault();
              setSelectedItems((prev) => {
                if (prev.has(item.url)) return prev;
                const next = new Set();
                next.add(item.url);
                return next;
              });
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                item,
              });
            }}
            onDragStartRow={(item, event) => {
              const urls = selectedItems.has(item.url)
                ? Array.from(selectedItems)
                : [item.url];
              event.dataTransfer.setData("text/plain", urls.join("|"));
              event.dataTransfer.effectAllowed = "copyMove";
            }}
            onDropOnFolder={async (folderUrl, event) => {
              const data = event.dataTransfer.getData("text/plain");
              const urls = data ? data.split("|").filter(Boolean) : [];
              if (!urls.length) return;
              const copyMode = event.ctrlKey || event.altKey;
              await moveOrCopyItems(urls, folderUrl, copyMode);
            }}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            selectedItems={selectedItems}
            focusFile={linkedFile}
            copiedUrl={copiedLink?.url}
            downloading={Boolean(downloadProgress)}
            onNewFolder={() => setFolderModalOpen(true)}
            onNewFile={() => setNewFileOpen(true)}
            onHeaderAction={(action) => {
              const selected = Array.from(selectedItems);
              const primary = selected.length ? selected[0] : null;
              if (!primary) return;
              const item = sortedItems.find((entry) => entry.url === primary);
              if (!item) return;
              if (action === "preview") {
                if (!item.isFolder) setPreviewItem(item);
                return;
              }
              if (action === "rename") {
                openRenameModal(item.url);
                return;
              }
              if (action === "download") {
                downloadFiles(selected);
                return;
              }
              if (action === "copy-link") {
                if (selected.length === 1) copyFileLink(item);
                return;
              }
              if (action === "share") {
                openShareModal(selected);
                return;
              }
              if (action === "delete") {
                openDeleteModal(selected);
              }
            }}
          />
          {downloadProgress && <div className="sdm-download-progress">
            <div role="status" aria-live="polite">
              <strong>{t("Preparing download…")}</strong>
              <span>{downloadProgress.files} {t("Files read")} / {formatBytes(downloadProgress.bytes)}</span>
              <span className="sdm-download-current" translate="no">{downloadProgress.current}</span>
            </div>
            <button type="button" className="sdm-button" onClick={() => downloadControllerRef.current?.abort()}>{t("Cancel download")}</button>
          </div>}
        </div>
      </div>
      <CreateFolderModal
        show={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onCreate={handleCreateFolder}
      />
      {newFileOpen && (
        <div className="modal-overlay sdm-modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">New file</span>
              <button
                className="modal-close"
                onClick={() => {
                  setNewFileOpen(false);
                  setNewFileName("");
                }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="modal-label">File name</label>
                <input
                  className="modal-input"
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="example.txt"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setNewFileOpen(false);
                  setNewFileName("");
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateFile}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      <ShareFileModal
        show={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setShareTargetUrl("");
          setShareAgents([]);
          setShareTargets([]);
        }}
        onShare={handleShareItem}
        onRemove={handleRemoveShare}
        existing={shareAgents}
      />
      {lastRenameBackup && <div className="sdm-rename-recovery" role="status"><strong>{t("Folder renamed")}</strong><div><button className="btn btn-secondary" onClick={() => downloadRenameBackup(lastRenameBackup)}>{t("Download backup")}</button><button className="btn btn-secondary" onClick={() => setLastRenameBackup(null)}>{t("Close")}</button></div></div>}
      {renameProgress && !renameModalOpen && <div className="modal-overlay sdm-modal-overlay"><div className="modal-box" role="dialog" aria-modal="true" aria-label={t("Renaming...")}><p role="status">{t(renameProgress)}</p></div></div>}
      {pendingRenames.length > 0 && <div className="sdm-rename-recovery" role="status">
        <strong>{t("Unfinished folder rename")}</strong>
        <p>{t("Files and a recovery backup have been retained. Resume the rename in this browser.")}</p>
        {pendingRenames.map(record => <div key={record.id}>
          <span>{decodeURIComponent(new URL(record.source).pathname)} → {decodeURIComponent(new URL(record.target).pathname)}</span>
          <button className="btn btn-primary" disabled={!!renameProgress} onClick={() => resumeRename(record)}>{t("Resume rename")}</button>
          <button className="btn btn-secondary" disabled={!record.resources?.length} onClick={() => downloadRenameBackup(record)}>{t("Download backup")}</button>
        </div>)}
        {renameProgress && <p>{t(renameProgress)}</p>}
        {resumeError && <p role="alert">{t(resumeError)}</p>}
      </div>}
      <RenameItemModal
        progress={renameProgress}
        show={renameModalOpen}
        onClose={() => {
          setRenameModalOpen(false);
          setRenameTargetUrl("");
          setRenameCurrentName("");
        }}
        onRename={handleRenameSubmit}
        currentName={renameCurrentName}
      />
      <ConfirmModal
        show={bulkDeleteOpen}
        title="Delete selected items?"
        message="This will permanently delete the selected items."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onClose={() => {
          setBulkDeleteOpen(false);
          setBulkDeleteTargets([]);
        }}
        onConfirm={handleDelete}
      />
      <AlertModal
        show={alertOpen}
        message={alertMessage}
        onClose={() => setAlertOpen(false)}
      />
      {previewItem && (
        <div
          className="modal-overlay sdm-modal-overlay"
          onClick={() => {
            setPreviewItem(null);
            setPreviewContent("");
            setPreviewEditableContent("");
            setPreviewEditMode(false);
          }}
        >
          <div
            className="modal-box preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">Preview</span>
              <button
                className="modal-close"
                onClick={() => {
                  setPreviewItem(null);
                  setPreviewContent("");
                  setPreviewEditableContent("");
                  setPreviewEditMode(false);
                }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="preview-meta">
                <div><strong>Name:</strong> <span translate="no">{previewItem.name}</span></div>
                <div><strong>Type:</strong> {getItemType(previewItem)}</div>
                <div><strong>Size:</strong> {formatBytes(previewItem.size)}</div>
              </div>
              {previewLoading ? (
                <ContentLoadingState variant="preview" />
              ) : previewEditMode ? (
                <textarea
                  className="preview-editor"
                  value={previewEditableContent}
                  onChange={(event) => setPreviewEditableContent(event.target.value)}
                />
              ) : (
                <pre className="preview-code">{previewContent || "No preview available."}</pre>
              )}
            </div>
            {isEditablePreview(previewItem) && !previewLoading && (
              <div className="modal-footer">
                {previewEditMode ? (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setPreviewEditMode(false);
                        setPreviewEditableContent(previewContent);
                      }}
                      disabled={previewSaving}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={savePreviewEdits}
                      disabled={previewSaving}
                    >
                      {previewSaving ? "Saving..." : "Save changes"}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => setPreviewEditMode(true)}
                  >
                    Edit file
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          className="context-menu sdm-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              setFolderModalOpen(true);
            }}
          >
            <FontAwesomeIcon icon={faFolder} /> New folder
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              setNewFileOpen(true);
            }}
          >
            <FontAwesomeIcon icon={faFile} /> New file
          </button>
          {!contextMenu.item.isFolder && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                setPreviewItem(contextMenu.item);
              }}
            >
              <FontAwesomeIcon icon={faEye} /> Preview
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              openRenameModal(contextMenu.item.url);
            }}
          >
            <FontAwesomeIcon icon={faPen} /> Rename
          </button>
          <button
              type="button"
              disabled={Boolean(downloadProgress)}
              onClick={() => {
                setContextMenu(null);
                const urls = selectedItems.has(contextMenu.item.url)
                  ? Array.from(selectedItems)
                  : [contextMenu.item.url];
                downloadFiles(urls);
              }}
            >
              <FontAwesomeIcon icon={faDownload} /> Download
            </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              const urls = selectedItems.has(contextMenu.item.url)
                ? Array.from(selectedItems)
                : [contextMenu.item.url];
              openShareModal(urls);
            }}
          >
            <FontAwesomeIcon icon={faShareNodes} /> Share
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              const urls = selectedItems.has(contextMenu.item.url)
                ? Array.from(selectedItems)
                : [contextMenu.item.url];
              setMoveCopyMode(false);
              setMoveCopySources(urls);
              setMoveCopyOpen(true);
            }}
          >
            <FontAwesomeIcon icon={faChevronRight} /> Move
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              const urls = selectedItems.has(contextMenu.item.url)
                ? Array.from(selectedItems)
                : [contextMenu.item.url];
              setMoveCopyMode(true);
              setMoveCopySources(urls);
              setMoveCopyOpen(true);
            }}
          >
            <FontAwesomeIcon icon={faCopy} /> Copy
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setContextMenu(null);
              const urls = selectedItems.has(contextMenu.item.url)
                ? Array.from(selectedItems)
                : [contextMenu.item.url];
              openDeleteModal(urls);
            }}
          >
            <FontAwesomeIcon icon={faTrash} /> Delete
          </button>
        </div>
      )}
      {moveCopyOpen && (
        <div className="modal-overlay sdm-modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">
                {moveCopyMode ? "Copy item" : "Move item"}
              </span>
              <button
                className="modal-close"
                onClick={() => {
                  setMoveCopyOpen(false);
                  setMoveCopyTarget("");
                  setMoveCopySources([]);
                }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="modal-label">Target folder URL</label>
                <input
                  className="modal-input"
                  type="text"
                  value={moveCopyTarget}
                  onChange={(e) => setMoveCopyTarget(e.target.value)}
                  placeholder="https://pod.example/storage/folder/"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setMoveCopyOpen(false);
                  setMoveCopyTarget("");
                  setMoveCopySources([]);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (!moveCopySources.length || !moveCopyTarget.trim()) return;
                  await moveOrCopyItems(moveCopySources, moveCopyTarget.trim(), moveCopyMode);
                  setMoveCopyOpen(false);
                  setMoveCopyTarget("");
                  setMoveCopySources([]);
                }}
                disabled={!moveCopyTarget.trim()}
              >
                {moveCopyMode ? "Copy" : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
