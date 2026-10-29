import React, { useState, useEffect } from "react";
import "./Modal.css";
import { useI18n } from "../i18n";

const RenameItemModal = ({ show, onClose, onRename, currentName, progress = "" }) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(currentName || "");

  useEffect(() => {
    setName(currentName || "");
    setError("");
  }, [currentName, show]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true); setError("");
    try { await onRename(trimmed); onClose(); }
    catch (failure) { setError(t(failure.message || "Rename failed.")); }
    finally { setBusy(false); }
  };

  if (!show) return null;

  return (
    <div className="modal-overlay sdm-modal-overlay">
      <div className="modal-box" role="dialog" aria-modal="true" aria-label={t("Rename Item")} aria-busy={busy}>
        <div className="modal-header">
          <span className="modal-title">Rename Item</span>
          <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <input
            type="text"
            className="modal-input"
            placeholder="New name"
            value={name}
            disabled={busy}
            onKeyDown={event => { if (event.key === "Enter") handleSubmit(); }}
            onChange={(e) => setName(e.target.value)}
          />
          {busy && <p role="status">{t(progress || "Renaming...")}</p>}
          {error && <p role="alert" className="sdm-rename-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={busy || !name.trim()}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
};

export default RenameItemModal;

