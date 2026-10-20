import React from "react";
import "./Modal.css";

const AlertModal = ({ show, message, onClose }) => {
  if (!show) return null;

  return (
    <div className="modal-overlay sdm-modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">Notice</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
