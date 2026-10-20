import React, { useState, useEffect } from "react";
import "./Modal.css";

const RenameItemModal = ({ show, onClose, onRename, currentName }) => {
  const [name, setName] = useState(currentName || "");

  useEffect(() => {
    setName(currentName || "");
  }, [currentName]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onRename(trimmed);
    setName("");
    onClose();
  };

  if (!show) return null;

  return (
    <div className="modal-overlay sdm-modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">Rename Item</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <input
            type="text"
            className="modal-input"
            placeholder="New name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
};

export default RenameItemModal;

