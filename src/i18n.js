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
  Preview: "Vorschau",
  Rename: "Umbenennen",
  Share: "Teilen",
  Upload: "Hochladen",
  "New folder": "Neuer Ordner",
  "New file": "Neue Datei",
  "Upload file": "Datei hochladen",
  "Search files...": "Dateien suchen...",
  "Loading...": "Wird geladen...",
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
  "Download failed.": "Download fehlgeschlagen.",
  "Delete failed.": "Löschen fehlgeschlagen.",
  "Rename failed.": "Umbenennen fehlgeschlagen.",
  "Upload failed.": "Upload fehlgeschlagen.",
  "Create folder failed.": "Ordner konnte nicht erstellt werden.",
  "No files found.": "Keine Dateien gefunden.",
  "Select a file to preview.": "Wähle eine Datei für die Vorschau aus.",
  "Solid Data Manager": "Solid Datenmanager",
  "Suggested providers": "Vorgeschlagene Anbieter",
  "Custom issuer": "Eigener Issuer",
  "Back to provider list": "Zurück zur Anbieter-Liste",
  "Log in with selected provider": "Mit ausgewähltem Anbieter anmelden",
};

Object.assign(enToDe, {
  Notice: "Hinweis",
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
  "Pod root": "Pod-Wurzel",
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
    return enToDe[body] ? withOriginalWhitespace(value, enToDe[body]) : value;
  }
  return deToEn[body] ? withOriginalWhitespace(value, deToEn[body]) : value;
}

function translateNode(node, language) {
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

function applyDocumentTranslations(language) {
  if (typeof document === "undefined" || !document.body) return;
  document.documentElement.lang = normalizeLanguage(language);
  translateNode(document.body, language);
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
