import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const SUPPORTED_LANGUAGES = ["en", "de"];
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "solid-dataspace.language";
export const LANGUAGE_EVENT = "solid-dataspace-language-change";
export const LANGUAGE_MESSAGE_TYPE = "solid-dataspace-language-change";

const enToDe = {
  "Uploading...": "Wird hochgeladen...",
  "Verifying uploaded size...": "Gespeicherte Dateigröße wird geprüft...",
  "Upload completed and size verified.": "Upload abgeschlossen und Dateigröße geprüft.",
  "Upload completed, but its size could not be verified.": "Upload abgeschlossen. Die gespeicherte Dateigröße konnte nicht geprüft werden.",
  "Upload cancelled. Files already completed are retained. Check the destination before trying again.": "Upload abgebrochen. Bereits vollständig übertragene Dateien bleiben erhalten. Prüfe den Zielordner vor einem erneuten Versuch.",
  "The saved file size does not match the original. Keep your original file and upload it again.": "Die gespeicherte Dateigröße stimmt nicht mit dem Original überein. Bewahre die Originaldatei auf und lade sie erneut hoch.",
  "Upload denied (403). You do not have write permission for this folder.": "Upload verweigert (403). Dir fehlt die Schreibberechtigung für diesen Ordner.",
  "The Pod server rejected the file size (413). Contact the server administrator.": "Der Pod-Server hat die Dateigröße abgelehnt (413). Wende dich an die Serveradministration.",
  "The upload timed out. Check the saved file before trying again.": "Zeitüberschreitung beim Upload. Prüfe die gespeicherte Datei vor einem erneuten Versuch.",
  "The Pod has insufficient storage (507).": "Der Pod hat nicht genügend freien Speicherplatz (507).",
  "The destination folder is unavailable or has changed. Refresh and try again.": "Der Zielordner ist nicht verfügbar oder wurde geändert. Aktualisiere die Ansicht und versuche es erneut.",
  "The file changed during upload. Refresh before trying again.": "Die Datei wurde während des Uploads geändert. Aktualisiere die Ansicht vor einem erneuten Versuch.",
  "The Pod server could not complete the upload. Check the saved file before trying again.": "Der Pod-Server konnte den Upload nicht abschließen. Prüfe die gespeicherte Datei vor einem erneuten Versuch.",
  "The upload could not be confirmed. Check your connection and the saved file before trying again.": "Der Upload konnte nicht bestätigt werden. Prüfe die Verbindung und die gespeicherte Datei vor einem erneuten Versuch.",

  "Use an absolute HTTP or HTTPS URL for uri.": "Bitte für uri eine vollständige HTTP- oder HTTPS-Adresse verwenden.",
  "Use a resource URL without credentials or query parameters.": "Bitte eine Ressourcenadresse ohne Zugangsdaten oder Abfrageparameter verwenden.",
  "Provide exactly one uri parameter.": "Bitte genau einen uri-Parameter angeben.",
  "The resource redirected to a different location. Open its direct URL instead.": "Die Ressource wurde an eine andere Adresse weitergeleitet. Bitte ihre direkte Adresse öffnen.",
  "The Pod storage could not be identified. Check the profile storage links or the server storage headers.": "Der Pod-Speicher konnte nicht erkannt werden. Bitte die Storage-Verweise im Profil oder die Storage-Header des Servers prüfen.",
  "The WebID profile could not be read. Please try again.": "Das WebID-Profil konnte nicht gelesen werden. Bitte erneut versuchen.",
  "No Pod storage is linked from this WebID profile.": "In diesem WebID-Profil ist kein Pod-Speicher verknüpft.",
  "Access denied (403). You do not have permission to open this resource.": "Zugriff verweigert (403). Dir fehlt die Berechtigung, diese Ressource zu öffnen.",
  "Resource not found (404). It may have been moved or deleted.": "Ressource nicht gefunden (404). Sie wurde möglicherweise verschoben oder gelöscht.",
  "The linked file is not listed in this folder. It may have been moved or is not accessible.": "Die verlinkte Datei ist in diesem Ordner nicht aufgeführt. Sie wurde möglicherweise verschoben oder ist nicht zugänglich.",
  "The linked resource could not be opened.": "Die verlinkte Ressource konnte nicht geöffnet werden.",

  "Folder rename is in progress. Resume it in Data Manager.": "Eine Ordnerumbenennung läuft noch. Setze sie im ursprünglichen Browser im Data Manager fort.",
  "Folder rename coordination failed.": "Die Abstimmung der Ordnerumbenennung ist fehlgeschlagen.",
  "Invalid rename source.": "Der Ausgangsordner ist ungültig.",
  "Invalid file name.": "Ungültiger Dateiname.",
  "Invalid folder rename.": "Diese Ordnerumbenennung ist nicht möglich.",
  "A resource has no safe version identifier. Rename stopped.": "Eine Ressource hat keine eindeutige Versionskennung. Die Umbenennung wurde gestoppt.",
  "A resource redirected. Rename stopped.": "Eine Ressource wurde umgeleitet. Die Umbenennung wurde gestoppt.",
  "Permissions cannot be preserved for this folder.": "Die Freigaben dieses Ordners können nicht sicher übernommen werden.",
  "Resource metadata cannot be preserved.": "Die Metadaten können nicht sicher übernommen werden.",
  "A source or reference changed. Rename stopped to preserve the newer version.": "Eine Quelle oder ein Verweis wurde zwischenzeitlich geändert. Die neuere Version bleibt erhalten.",
  "Permissions changed. Rename stopped.": "Freigaben wurden zwischenzeitlich geändert. Die Umbenennung wurde gestoppt.",
  "Resource metadata changed. Rename stopped.": "Metadaten wurden zwischenzeitlich geändert. Die Umbenennung wurde gestoppt.",
  "The pending rename belongs to another folder.": "Die ausstehende Umbenennung gehört zu einem anderen Ordner.",
  "Folder nesting exceeds the rename limit.": "Der Ordner enthält zu viele Unterordnerebenen für die Umbenennung.",
  "A catalog or connection reference cannot be updated.": "Ein Katalog- oder Verbindungsverweis kann nicht aktualisiert werden.",
  "Unsafe folder contents.": "Der Ordner enthält ungültige Ressourcenverweise.",
  "Import settings changed. Folder rename remains paused.": "Importeinstellungen wurden geändert. Die Ordnerumbenennung bleibt angehalten.",
  "Failed to fetch": "Die Verbindung ist unterbrochen. Bitte erneut versuchen.",
  "Load failed": "Die Verbindung ist unterbrochen. Bitte erneut versuchen.",

  "Folders containing permission identities require a separate migration.": "Ordner mit Identitäten für Freigaben benötigen eine gesonderte Migration.",
  "Folder renamed": "Ordner umbenannt",
  "On Test, rename folders inside connections/test/ only.": "Auf Test können nur Ordner innerhalb von connections/test/ umbenannt werden.",
  "Folder rename coordination is unavailable. No files were changed.": "Die Abstimmung mit Data Connection ist nicht verfügbar. Es wurden keine Dateien geändert.",
  "Application system folders cannot be renamed.": "Systemordner der Anwendungen können nicht umbenannt werden.",
  "Invalid folder name.": "Ungültiger Ordnername.",
  "Finish the pending folder rename first.": "Bitte zuerst die ausstehende Ordnerumbenennung abschließen.",
  "Unfinished folder rename": "Nicht abgeschlossene Ordnerumbenennung",
  "Files and a recovery backup have been retained. Resume the rename in this browser.": "Dateien und Wiederherstellungssicherung wurden aufbewahrt. Setze die Umbenennung in diesem Browser fort.",
  "Resume rename": "Umbenennung fortsetzen",
  "Download backup": "Sicherung herunterladen",
  "Renaming...": "Wird umbenannt...",
  "Waiting for Data Connection...": "Warte auf Data Connection...",
  "Backing up files and permissions...": "Dateien und Freigaben werden gesichert...",
  "Checking catalog and connection references...": "Katalog- und Verbindungsverweise werden geprüft...",
  "Copying and verifying files...": "Dateien werden kopiert und geprüft...",
  "Updating catalog and Data Connection references...": "Verweise in Katalog und Data Connection werden aktualisiert...",
  "Finishing folder rename...": "Ordnerumbenennung wird abgeschlossen...",
  "Rename paused. Files and backup are retained. Use Resume rename to continue.": "Umbenennung angehalten. Dateien und Sicherung sind erhalten. Nutze „Umbenennung fortsetzen“, um fortzufahren.",
  "A connection is running. Wait for it to finish and try again.": "Eine Verbindung läuft noch. Warte auf ihren Abschluss und versuche es erneut.",
  "Rename the complete import target folder, not one of its subfolders.": "Bitte den vollständigen Zielordner des Imports umbenennen, nicht einen Unterordner.",
  "The target overlaps another import.": "Das Ziel überschneidet sich mit einem anderen Import.",
  "The target already exists or cannot be checked.": "Das Ziel existiert bereits oder kann nicht geprüft werden.",
  "Read, write and permission management are required to rename a folder.": "Zum Umbenennen eines Ordners sind Lese-, Schreib- und Freigaberechte erforderlich.",
  "A file, folder or permission could not be read. Rename stopped.": "Eine Datei, ein Ordner oder eine Freigabe konnte nicht gelesen werden. Die Umbenennung wurde gestoppt.",
  "Folder rename exceeds the 128 MiB backup limit.": "Der Ordner überschreitet die Sicherungsgrenze von 128 MiB.",
  "Folder rename exceeds the backup limit.": "Der Ordner überschreitet die Sicherungsgrenze.",
  "The backup could not be saved. No rename was started.": "Die Sicherung konnte nicht gespeichert werden. Die Umbenennung wurde nicht gestartet.",
  "The backup could not be saved.": "Die Sicherung konnte nicht gespeichert werden.",

  "Folder navigation": "Ordnernavigation",
  "item": "Element",
  "items": "Elemente",
  "selected": "ausgewählt",
  "Select files to manage them": "Dateien zum Verwalten auswählen",
  "File actions": "Dateiaktionen",
  "Files and folders": "Dateien und Ordner",
  "Select": "Auswählen",
  "No matching files": "Keine passenden Dateien",
  "This folder is empty": "Dieser Ordner ist leer",
  "Try another search term.": "Versuche einen anderen Suchbegriff.",
  "Upload a file or create a folder to get started.": "Lade eine Datei hoch oder erstelle einen Ordner.",

  Language: "Sprache",
  English: "Englisch",
  German: "Deutsch",
  Logout: "Abmelden",
  Login: "Anmelden",
  Save: "Speichern",
  Cancel: "Abbrechen",
  Close: "Schließen",
  Confirm: "Bestätigen",
  Delete: "Löschen",
  Download: "Herunterladen",
  "Copy link": "Link kopieren",
  "Link copied": "Link kopiert",
  "File URL": "Datei-URL",
  "Your browser could not copy the link automatically. Copy the URL below.":
    "Dein Browser konnte den Link nicht automatisch kopieren. Kopiere die URL unten.",
  Preview: "Vorschau",
  Rename: "Umbenennen",
  Share: "Teilen",
  Upload: "Hochladen",
  "New folder": "Neuer Ordner",
  "New file": "Neue Datei",
  "Upload file": "Datei hochladen",
  "Search files...": "Dateien suchen...",
  "Loading...": "Wird geladen...",
  "Loading preview...": "Vorschau wird geladen...",
  "Loading your personal Pod workspace …":
    "Dein persönlicher Pod-Bereich wird geladen …",
  "File preview": "Dateivorschau",
  "Loading your personal file preview …":
    "Deine persönliche Dateivorschau wird geladen …",
  Name: "Name",
  Type: "Typ",
  Size: "Größe",
  "Last Modified": "Zuletzt geändert",
  Folder: "Ordner",
  Image: "Bild",
  Other: "Sonstige",
  "Solid Pod User": "Solid-Pod-Nutzer",
  Profile: "Profil",
  "Rename item": "Element umbenennen",
  "Create folder": "Ordner erstellen",
  "Share file": "Datei teilen",
  "Preparing download…": "Download wird vorbereitet…",
  "Files read": "Dateien gelesen",
  "Cancel download": "Download abbrechen",
  "Download stopped: you do not have permission to read all selected files and folders.": "Download abgebrochen: Du hast nicht für alle ausgewählten Dateien und Ordner eine Leseberechtigung.",
  "Download stopped: a file or folder no longer exists.": "Download abgebrochen: Eine Datei oder ein Ordner ist nicht mehr vorhanden.",
  "Download stopped because a folder contains an invalid resource reference.": "Download abgebrochen, weil ein Ordner einen ungültigen Ressourcenverweis enthält.",
  "Download too large. Select fewer files or a smaller folder (up to 256 MiB and 10,000 entries).": "Download zu groß. Wähle weniger Dateien oder einen kleineren Ordner (bis zu 256 MiB und 10.000 Einträge).",
  "Download stopped because two resources have the same archive path.": "Download abgebrochen, weil zwei Ressourcen denselben Pfad im Archiv haben.",
  "Your browser cannot prepare this folder download. Please use a current browser.": "Dein Browser kann diesen Ordnerdownload nicht vorbereiten. Bitte verwende einen aktuellen Browser.",
  "Download failed. Please try again or check your connection.": "Download fehlgeschlagen. Bitte versuche es erneut oder prüfe deine Verbindung.",
  "Download failed.": "Download fehlgeschlagen.",
  "Delete failed.": "Löschen fehlgeschlagen.",
  "Authentication required (401). Please log in again.":
    "Anmeldung erforderlich (401). Bitte melde dich erneut an.",
  "Access denied (403). You do not have permission to open this folder.":
    "Zugriff verweigert (403). Du hast keine Berechtigung, diesen Ordner zu öffnen.",
  "Access denied (403). You do not have permission to delete the selected items.":
    "Zugriff verweigert (403). Du hast keine Berechtigung, die ausgewählten Elemente zu löschen.",
  "Folder not found (404). It may have been moved or deleted.":
    "Ordner nicht gefunden (404). Er wurde möglicherweise verschoben oder gelöscht.",
  "Delete failed (404). An item no longer exists.":
    "Löschen fehlgeschlagen (404). Ein Element ist nicht mehr vorhanden.",
  "Delete failed (409). The folder may not be empty.":
    "Löschen fehlgeschlagen (409). Der Ordner ist möglicherweise nicht leer.",
  "Delete stopped because a folder contains an invalid resource reference.":
    "Löschen abgebrochen, weil ein Ordner einen ungültigen Ressourcenverweis enthält.",
  "Delete failed. Please try again.":
    "Löschen fehlgeschlagen. Bitte versuche es erneut.",
  "Opening folder failed. Please try again or check your connection.":
    "Ordner konnte nicht geöffnet werden. Bitte versuche es erneut oder prüfe deine Verbindung.",
  "Rename failed.": "Umbenennen fehlgeschlagen.",
  "Upload failed.": "Upload fehlgeschlagen.",
  "Create folder failed.": "Ordner konnte nicht erstellt werden.",
  "No files found.": "Keine Dateien gefunden.",
  "Select a file to preview.": "Wähle eine Datei für die Vorschau aus.",
  "Solid Data Manager": "Solid Data Manager",
  "Suggested providers": "Vorgeschlagene Anbieter",
  "Custom issuer": "Eigener Issuer",
  "Back to provider list": "Zurück zur Anbieter-Liste",
  "Log in with selected provider": "Mit ausgewähltem Anbieter anmelden",
};

Object.assign(enToDe, {
  Notice: "Hinweis",
  "Copy item": "Element kopieren",
  "Saving...": "Wird gespeichert...",
  "No preview available.": "Keine Vorschau verfügbar.",
  "Failed to create folder.": "Ordner konnte nicht erstellt werden.",
  "Failed to create file.": "Datei konnte nicht erstellt werden.",
  "Failed to save file changes.": "Dateiänderungen konnten nicht gespeichert werden.",
  "Failed to load ACL.": "ACL konnte nicht geladen werden.",
  "Sharing failed.": "Teilen fehlgeschlagen.",
  "Failed to remove access.": "Zugriff konnte nicht entzogen werden.",
  "Move/Copy failed.": "Verschieben oder Kopieren fehlgeschlagen.",
  Create: "Erstellen",
  "Create Folder": "Ordner erstellen",
  "Folder name": "Ordnername",
  Copy: "Kopieren",
  Data: "Daten",
  "Delete selected items?": "Ausgewählte Elemente löschen?",
  "Edit file": "Datei bearbeiten",
  "File name": "Dateiname",
  "Loading preview...": "Vorschau wird geladen...",
  Manager: "Manager",
  Move: "Verschieben",
  "Move item": "Element verschieben",
  "Name:": "Name:",
  "Pod root": "Pod Root",
  "Pod Root": "Pod Root",
  "Save changes": "Änderungen speichern",
  "Size:": "Größe:",
  "Target folder URL": "Zielordner-URL",
  "This will permanently delete the selected items.":
    "Dadurch werden die ausgewählten Elemente dauerhaft gelöscht.",
  "Type:": "Typ:",
  "New name": "Neuer Name",
  "Rename Item": "Element umbenennen",
  Access: "Zugriff",
  "Current Access": "Aktueller Zugriff",
  "No access": "Kein Zugriff",
  "Remove access": "Zugriff entfernen",
  "Share File": "Datei teilen",
});

const deToEn = Object.entries(enToDe).reduce((acc, [en, de]) => {
  acc[de] = en;
  return acc;
}, {});

function withOriginalWhitespace(original, translated) {
  const leading = original.match(/^\s*/)?.[0] || "";
  const trailing = original.match(/\s*$/)?.[0] || "";
  return `${leading}${translated}${trailing}`;
}

export function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("en")) return "en";
  return DEFAULT_LANGUAGE;
}

function getLanguageFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("lang") || params.get("language");
    return value ? normalizeLanguage(value) : "";
  } catch {
    return "";
  }
}

function getLanguageFromHostBridge() {
  if (typeof window === "undefined" || window.parent === window) return "";
  try {
    if (window.parent.location.origin !== window.location.origin) return "";
    const value = window.parent.__SOLID_DATASPACE_AUTH__?.getLanguage?.();
    return value ? normalizeLanguage(value) : "";
  } catch {
    return "";
  }
}

function readStoredLanguage() {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return value ? normalizeLanguage(value) : "";
  } catch {
    return "";
  }
}

function writeStoredLanguage(language) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(language));
  } catch {
    // Ignore storage failures.
  }
}

function resolveInitialLanguage() {
  return (
    getLanguageFromUrl() ||
    getLanguageFromHostBridge() ||
    readStoredLanguage() ||
    DEFAULT_LANGUAGE
  );
}

export function translateText(value, language) {
  if (typeof value !== "string" || !value.trim()) return value;
  const body = value.trim();
  const target = normalizeLanguage(language);
  if (target === "de") {
    return Object.prototype.hasOwnProperty.call(enToDe, body) ? withOriginalWhitespace(value, enToDe[body]) : value;
  }
  return Object.prototype.hasOwnProperty.call(deToEn, body) ? withOriginalWhitespace(value, deToEn[body]) : value;
}

function translateNode(node, language) {
  // User data and code are not UI copy. Respect the HTML translation boundary
  // across embedded apps as well as in the standalone document.
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/translate
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (element?.closest('[translate="no"], .notranslate, [data-i18n-skip], [contenteditable]:not([contenteditable="false"])')) return;
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const next = translateText(node.nodeValue || "", language);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"].includes(node.tagName)) {
    return;
  }
  ["title", "placeholder", "aria-label", "alt"].forEach((name) => {
    if (!node.hasAttribute?.(name)) return;
    const current = node.getAttribute(name);
    const next = translateText(current, language);
    if (next !== current) node.setAttribute(name, next);
  });
  node.childNodes.forEach((child) => translateNode(child, language));
}

export function applyDocumentTranslations(language, root) {
  if (typeof document === "undefined") return;
  const targetRoot = root || document.body;
  if (!targetRoot) return;
  document.documentElement.lang = normalizeLanguage(language);
  translateNode(targetRoot, language);
}

function installDomTranslator(getLanguage) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }
  let scheduled = false;
  const run = () => {
    scheduled = false;
    applyDocumentTranslations(getLanguage());
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(run);
  };
  const observer = new MutationObserver(schedule);
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "placeholder", "aria-label", "alt"],
    });
    schedule();
  }
  return () => observer.disconnect();
}

function publishLanguage(language) {
  if (typeof window === "undefined") return;
  const normalized = normalizeLanguage(language);
  writeStoredLanguage(normalized);
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { language: normalized } }));
  try {
    window.parent?.postMessage({ type: LANGUAGE_MESSAGE_TYPE, language: normalized }, "*");
  } catch {
    // Ignore cross-window failures.
  }
  try {
    window.parent?.__SOLID_DATASPACE_AUTH__?.setLanguage?.(normalized);
  } catch {
    // Ignore bridge failures.
  }
}

function subscribeLanguage(callback) {
  if (typeof window === "undefined") return () => {};
  const handleEvent = (event) => callback(normalizeLanguage(event?.detail?.language));
  const handleStorage = (event) => {
    if (event.key === LANGUAGE_STORAGE_KEY && event.newValue) {
      callback(normalizeLanguage(event.newValue));
    }
  };
  const handleMessage = (event) => {
    const data = event.data || {};
    if (data.type === LANGUAGE_MESSAGE_TYPE && data.language) {
      callback(normalizeLanguage(data.language));
    }
  };
  let unsubscribeBridge;
  try {
    unsubscribeBridge = window.parent?.__SOLID_DATASPACE_AUTH__?.subscribeLanguage?.(callback);
  } catch {
    unsubscribeBridge = undefined;
  }
  window.addEventListener(LANGUAGE_EVENT, handleEvent);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("message", handleMessage);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, handleEvent);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("message", handleMessage);
    unsubscribeBridge?.();
  };
}

const I18nContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (value) => value,
});

export function I18nProvider({ children, language: controlledLanguage }) {
  const [internalLanguage, setInternalLanguage] = useState(resolveInitialLanguage);
  const language = normalizeLanguage(controlledLanguage || internalLanguage);
  const languageRef = useRef(language);
  languageRef.current = language;

  const setLanguage = useCallback(
    (nextLanguage) => {
      const normalized = normalizeLanguage(nextLanguage);
      if (!controlledLanguage) setInternalLanguage(normalized);
      publishLanguage(normalized);
    },
    [controlledLanguage]
  );

  useEffect(() => {
    applyDocumentTranslations(language);
  }, [language]);

  useEffect(() => installDomTranslator(() => languageRef.current), []);

  useEffect(
    () =>
      subscribeLanguage((nextLanguage) => {
        if (nextLanguage === languageRef.current) return;
        if (!controlledLanguage) setInternalLanguage(nextLanguage);
      }),
    [controlledLanguage]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key) => translateText(key, language),
    }),
    [language, setLanguage]
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSelect({ className = "", compact = false, label = "" } = {}) {
  const { language, setLanguage, t } = useI18n();
  return React.createElement(
    "label",
    { className: `language-select ${className}`.trim() },
    !compact &&
      React.createElement(
        "span",
        { className: "language-select__label" },
        label || t("Language")
      ),
    React.createElement(
      "select",
      {
        value: language,
        onChange: (event) => setLanguage(event.target.value),
        "aria-label": t("Language"),
        title: t("Language"),
      },
      React.createElement(
        "option",
        { value: "en" },
        language === "de" ? "Englisch" : "English"
      ),
      React.createElement("option", { value: "de" }, "Deutsch")
    )
  );
}
