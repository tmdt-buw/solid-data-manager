import React, { useState } from "react";
import "./Modal.css";

const CreateFolderModal = ({ show, onClose, onCreate }) => {
  const [name, setName] = useState("");

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
    onClose();
  };

  if (!show) return null;

  return (
    <div className="modal-overlay sdm-modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">Create Folder</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <input
            type="text"
            className="modal-input"
            placeholder="Folder name"
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
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateFolderModal;
