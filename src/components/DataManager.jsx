import React, { useEffect, useState, useRef } from "react";
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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFolder,
  faFile,
  faUpload,
  faPen,
  faTrash,
  faDownload,
  faShareNodes,
  faChevronRight,
  faEye,
  faCopy,
  faRightFromBracket,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import "./DataManager.css";
import CreateFolderModal from "./CreateFolderModal";
import ShareFileModal from "./ShareFileModal";
import RenameItemModal from "./RenameItemModal";
import AlertModal from "./AlertModal";
import ConfirmModal from "./ConfirmModal";
import { appVersion } from "../version";

const noCacheFetch = (input, init = {}) =>
  session.fetch(input, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers || {}), "Cache-Control": "no-cache" }
  });

function guessContentType(filename, fallback = "application/octet-stream") {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ttl":
      return "text/turtle";
    case "json":
      return "application/json";
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

function getItemType(item) {
  if (item.isFolder) return "Folder";
  const ext = getExtension(item.name);
  if (!ext) return "Other";
  if (["json", "csv", "ttl"].includes(ext)) return ext.toUpperCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "Image";
  return ext.toUpperCase();
}

function TopHeader({ headerUser, onLogout }) {
  const showUser = headerUser && onLogout;
  const showHeaderVersion = !showUser;
  const podLabel = headerUser?.webId || headerUser?.podHost || "Pod";
  const displayName = headerUser?.name || "Solid Pod User";
  return (
    <div className="toolbar toolbar--title">
      <div className="crumb">
        <FontAwesomeIcon icon={faFolder} className="crumb-icon" />
        <span>Solid <span className="crumb-highlight">Data</span> Manager</span>
      </div>
      <div className="toolbar-title-right">
        {showUser ? (
          <div className="toolbar-user">
            <div className="toolbar-user-info">
              {headerUser.avatarUrl ? (
                <div className="toolbar-user-avatar">
                  <img src={headerUser.avatarUrl} alt="Profile" />
                </div>
              ) : null}
              <div className="toolbar-user-meta">
                <span className="toolbar-user-name">
                  {displayName} ({podLabel})
                </span>
              </div>
            </div>
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

function FilesView({
  items,
  loading,
  uploadFile,
  navigateTo,
  crumbs,
  onRowSelect,
  onRowContextMenu,
  onDropOnFolder,
  onDragStartRow,
  searchQuery,
  onSearchQueryChange,
  selectedItems,
  onNewFolder,
  onNewFile,
  onHeaderAction,
}) {
  const visibleItems = items;
  return (
    <>
      <div className="toolbar">
        <div className="crumb">
          {crumbs.map((crumb, index) => (
            <React.Fragment key={crumb.url}>
              {index > 0 && (
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="crumb-separator"
                />
              )}
              {index === crumbs.length - 1 ? (
                <span>{crumb.name}</span>
              ) : (
                <span
                  className="crumb-link"
                  onClick={() => navigateTo(crumb.url)}
                >
                  {crumb.name}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="primary-actions">
          <div className="header-actions">
            <button
              className="icon-btn icon-btn--ghost"
              title="Preview"
              onClick={() => onHeaderAction("preview")}
              disabled={selectedItems.size === 0}
            >
              <FontAwesomeIcon icon={faEye} />
            </button>
            <button
              className="icon-btn icon-btn--ghost"
              title="Rename"
              onClick={() => onHeaderAction("rename")}
              disabled={selectedItems.size === 0}
            >
              <FontAwesomeIcon icon={faPen} />
            </button>
            <button
              className="icon-btn icon-btn--ghost"
              title="Download"
              onClick={() => onHeaderAction("download")}
              disabled={selectedItems.size === 0}
            >
              <FontAwesomeIcon icon={faDownload} />
            </button>
            <button
              className="icon-btn icon-btn--ghost"
              title="Share"
              onClick={() => onHeaderAction("share")}
              disabled={selectedItems.size === 0}
            >
              <FontAwesomeIcon icon={faShareNodes} />
            </button>
            <button
              className="icon-btn icon-btn--ghost"
              title="Delete"
              onClick={() => onHeaderAction("delete")}
              disabled={selectedItems.size === 0}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
          <button onClick={onNewFolder} className="pill-btn" title="New folder">
            <FontAwesomeIcon icon={faFolder} /> <span>New folder</span>
          </button>
          <button onClick={onNewFile} className="pill-btn" title="New file">
            <FontAwesomeIcon icon={faFile} /> <span>New file</span>
          </button>
          <button onClick={uploadFile} className="pill-btn" title="Upload file">
            <FontAwesomeIcon icon={faUpload} /> <span>Upload</span>
          </button>
          <div className="data-search data-search--inline">
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
            />
            <span className="data-search-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </span>
          </div>
        </div>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="file-table-container">
            <table className="file-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Last Modified</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item, index) => {
                  const { url, lastModified, isFolder, name, size } = item;
                  return (
                    <tr
                      key={url}
                      draggable={!isFolder}
                      className={selectedItems.has(url) ? "row-selected" : ""}
                      onDragStart={(event) => onDragStartRow(item, event)}
                      onContextMenu={(event) => onRowContextMenu(item, event)}
                      onDragOver={(event) => {
                        if (isFolder) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (!isFolder) return;
                        event.preventDefault();
                        onDropOnFolder(url, event);
                      }}
                      onClick={(event) => {
                        if (event.target.closest("button") || event.target.closest("input")) {
                          return;
                        }
                        onRowSelect(item, index, event);
                      }}
                    >
                      <td>
                        {isFolder ? (
                          <span
                            role="button"
                            tabIndex={0}
                            className="file-name-action file-name-action--folder"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigateTo(url);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              event.stopPropagation();
                              navigateTo(url);
                            }}
                          >
                            <FontAwesomeIcon
                              icon={faFolder}
                              className="file-icon folder"
                            />
                            <span className="file-name-text">{name}</span>
                          </span>
                        ) : (
                          <span className="file-name-action">
                            <FontAwesomeIcon
                              icon={faFile}
                              className="file-icon file"
                            />
                            <span className="file-name-text">{name}</span>
                          </span>
                        )}
                      </td>
                      <td>{getItemType(item)}</td>
                      <td>{formatBytes(size)}</td>
                      <td>
                        {lastModified
                          ? new Date(lastModified).toLocaleString("de-DE", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default function DataManager({ webId, headerUser, onLogout }) {
  const [currentUrl, setCurrentUrl] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState(new Set());
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
  const rootUrlRef = useRef("");
  const lastSelectedIndexRef = useRef(null);

  useEffect(() => {
    if (!webId) return;
    const url = new URL(webId);
    const segments = url.pathname.split("/").filter(Boolean);
    const profileIndex = segments.indexOf("profile");
    const baseSegments = profileIndex > -1 ? segments.slice(0, profileIndex) : segments;
    const basePath = baseSegments.length ? `/${baseSegments.join("/")}/` : "/";
    const rootUrl = `${url.origin}${basePath}`;
    rootUrlRef.current = rootUrl;
    setCurrentUrl(rootUrl);
    loadItems(rootUrl);
  }, [webId]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [contextMenu]);

  useEffect(() => {
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const dropHandler = async (e) => {
      preventDefaults(e);
      const files = e.dataTransfer.files;
      const uploadPromises = Array.from(files).map(async (file) => {
        const targetUrl = currentUrl + file.name;
        try {
          await overwriteFile(targetUrl, file, {
            contentType: file.type || guessContentType(file.name),
            fetch: noCacheFetch,
          });
        } catch {}
      });
      await Promise.all(uploadPromises);
      loadItems(currentUrl);
    };
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) =>
      window.addEventListener(eventName, preventDefaults, false)
    );
    window.addEventListener("drop", dropHandler);
    return () => {
      ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) =>
        window.removeEventListener(eventName, preventDefaults, false)
      );
      window.removeEventListener("drop", dropHandler);
    };
  }, [currentUrl]);

  const loadItems = async (url) => {
    try {
      setLoading(true);
      setPreviewItem(null);
      setPreviewContent("");
      const dataset = await getSolidDataset(url, { fetch: noCacheFetch });
      const containedUrls = getContainedResourceUrlAll(dataset);
      let allUrls = [...containedUrls];

      allUrls = Array.from(new Set(allUrls));
      const itemInfos = await Promise.all(
        allUrls.map(async (itemUrl) => {
          try {
            const res = await noCacheFetch(itemUrl, { method: "HEAD" });
            const isFolder = itemUrl.endsWith("/");
            const name = decodeURIComponent(
              itemUrl.replace(url, "").replace(/\/$/, "")
            );
            const sizeHeader = res.headers.get("Content-Length");
            const size = sizeHeader ? Number(sizeHeader) : null;
            return {
              url: itemUrl,
              lastModified: res.headers.get("Last-Modified"),
              size,
              isFolder,
              name,
            };
          } catch {
            const isFolder = itemUrl.endsWith("/");
            const name = decodeURIComponent(
              itemUrl.replace(url, "").replace(/\/$/, "")
            );
            return { url: itemUrl, lastModified: null, size: null, isFolder, name };
          }
        })
      );
      setItems(itemInfos);
      setSelectedItems(new Set());
      lastSelectedIndexRef.current = null;
    } catch {} finally {
      setLoading(false);
    }
  };

  const navigateTo = (url) => {
    const nextUrl = url.endsWith("/") ? url : url + "/";
    setCurrentUrl(nextUrl);
    setSelectedItems(new Set());
    lastSelectedIndexRef.current = null;
    setPreviewItem(null);
    loadItems(nextUrl);
  };

  const computeCrumbs = () => {
    const rootUrl = rootUrlRef.current;
    if (!rootUrl) return [];
    const url = new URL(currentUrl);
    const root = new URL(rootUrl);
    const relative = url.pathname.replace(root.pathname, "");
    const parts = relative.split("/").filter(Boolean);
    const crumbs = [{ name: "Pod root", url: rootUrl }];
    parts.forEach((part, idx) => {
      const partUrl = rootUrl + parts.slice(0, idx + 1).join("/") + "/";
      crumbs.push({ name: decodeURIComponent(part), url: partUrl });
    });
    return crumbs;
  };

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

  const showAlert = (msg) => {
    setAlertMessage(msg);
    setAlertOpen(true);
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

  const isEditablePreview = (item) => {
    if (!item) return false;
    const ext = getExtension(item.name);
    if (!ext) return true;
    return ["json", "csv", "txt", "ttl"].includes(ext);
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

  const deleteRecursive = async (url) => {
    if (url.endsWith("/")) {
      try {
        const dataset = await getSolidDataset(url, { fetch: noCacheFetch });
        const contained = getContainedResourceUrlAll(dataset);
        for (const item of contained) {
          await deleteRecursive(item);
        }
      } catch {}
      await deleteContainer(url, { fetch: noCacheFetch });
    } else {
      await deleteFile(url, { fetch: noCacheFetch });
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
    try {
      for (const url of bulkDeleteTargets) {
        await deleteRecursive(url);
      }
      await loadItems(currentUrl);
    } catch {
      showAlert("Delete failed.");
    } finally {
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

  const performRename = async (url, newName) => {
    if (!newName) return;
    const newUrl = currentUrl + newName + (url.endsWith("/") ? "/" : "");
    try {
      const res = await noCacheFetch(url);
      const data = await res.blob();
      await overwriteFile(newUrl, data, {
        contentType: res.headers.get("Content-Type") || "application/octet-stream",
        fetch: noCacheFetch,
      });
      if (url.endsWith("/")) await deleteContainer(url, { fetch: noCacheFetch });
      else await deleteFile(url, { fetch: noCacheFetch });
      await loadItems(currentUrl);
    } catch {
      showAlert("Rename failed.");
    }
  };

  const handleRenameSubmit = async (newName) => {
    await performRename(renameTargetUrl, newName);
    setRenameModalOpen(false);
    setRenameTargetUrl("");
    setRenameCurrentName("");
  };

  const uploadFile = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      const targetUrl = currentUrl + file.name;
      try {
        await overwriteFile(targetUrl, file, {
          contentType: file.type || guessContentType(file.name),
          fetch: noCacheFetch,
        });
        await loadItems(currentUrl);
      } catch {
        showAlert("Upload failed.");
      }
    };
    input.click();
  };

  

  const downloadFile = async (fileUrl) => {
    try {
      const response = await noCacheFetch(fileUrl);
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileUrl.split("/").pop();
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      showAlert("Download failed.");
    }
  };

  const downloadFiles = async (urls) => {
    for (const url of urls) {
      if (url.endsWith("/")) continue;
      await downloadFile(url);
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

  const loadPreview = async (item) => {
    if (!item || item.isFolder) return;
    setPreviewLoading(true);
    try {
      const res = await noCacheFetch(item.url);
      if (!res.ok) throw new Error("Preview failed.");
      const ext = getExtension(item.name);
      const text = await res.text();
      if (ext === "json") {
        try {
          const parsed = JSON.parse(text);
          setPreviewContent(JSON.stringify(parsed, null, 2));
          setPreviewEditableContent(JSON.stringify(parsed, null, 2));
        } catch {
          setPreviewContent(text.slice(0, 5000));
          setPreviewEditableContent(text.slice(0, 5000));
        }
      } else {
        setPreviewContent(text.slice(0, 5000));
        setPreviewEditableContent(text.slice(0, 5000));
      }
      setPreviewEditMode(false);
    } catch {
      setPreviewContent("No preview available.");
      setPreviewEditableContent("");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (previewItem) {
      loadPreview(previewItem);
    }
  }, [previewItem]);

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
        const trimmed = url.replace(/\/$/, "");
        const name = decodeURIComponent(trimmed.split("/").pop() || "");
        const destUrl = `${target}${name}${url.endsWith("/") ? "/" : ""}`;
        await copyRecursive(url, destUrl);
        if (!copyMode) {
          await deleteRecursive(url);
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
    if (isHidden) return false;
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
      <TopHeader headerUser={headerUser} onLogout={onLogout} />
      <div className="data-manager-layout">
        <div className="data-manager-main">
          <FilesView
            items={sortedItems}
            loading={loading}
            uploadFile={uploadFile}
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
              if (action === "share") {
                openShareModal(selected);
                return;
              }
              if (action === "delete") {
                openDeleteModal(selected);
              }
            }}
          />
        </div>
      </div>
      <CreateFolderModal
        show={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onCreate={handleCreateFolder}
      />
      {newFileOpen && (
        <div className="modal-overlay">
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
      <RenameItemModal
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
          className="modal-overlay"
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
                <div><strong>Name:</strong> {previewItem.name}</div>
                <div><strong>Type:</strong> {getItemType(previewItem)}</div>
                <div><strong>Size:</strong> {formatBytes(previewItem.size)}</div>
              </div>
              {previewLoading ? (
                <div className="preview-loading">Loading preview...</div>
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
          className="context-menu"
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
          {!contextMenu.item.isFolder && (
            <button
              type="button"
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
          )}
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
        <div className="modal-overlay">
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
