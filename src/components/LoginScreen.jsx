import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket, faLock } from "@fortawesome/free-solid-svg-icons";
import "../LoginScreen.css";

export default function LoginScreen({ onLogin }) {
  const providers = [
    { label: "TMDT Solid", url: "https://solid-community-server.tmdt.info", note: "Recommended" },
    { label: "Solid Community", url: "https://solidcommunity.net", note: "Public community server" },
  ];
  const [selected, setSelected] = useState(providers[0].url);
  const [customIssuer, setCustomIssuer] = useState("");
  const useCustom = customIssuer.trim().length > 0;
  const issuerToLogin = useCustom ? customIssuer.trim() : selected;

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="login-hero-left">
          <div className="login-hero-icon">
            <FontAwesomeIcon icon={faLock} />
          </div>
          <div>
            <div className="login-hero-title">Solid Data Manager</div>
            <div className="login-hero-sub">Choose your Solid Pod provider</div>
          </div>
        </div>
      </div>
      <div className="login-card">
        <div className="login-section">
          <div className="provider-guide">
            <div className="provider-guide-head">
              <span className="guide-title">No Solid Pod yet?</span>
              <span className="guide-sub">Example using the <strong>TMDT Solid Server</strong></span>
            </div>
            <div className="guide-steps">
              <div className="guide-step">
                <span className="step-num">1</span>
                <p>
                  Visit <a href="https://solid-community-server.tmdt.info" target="_blank" rel="noreferrer">solid-community-server.tmdt.info</a> or any other Solid Pod Provider.
                </p>
              </div>
              <div className="guide-step">
                <span className="step-num">2</span>
                <p>Click <strong>Register</strong> to create your account.</p>
              </div>
              <div className="guide-step">
                <span className="step-num">3</span>
                <p>Log in and choose a name to create your Pod.</p>
              </div>
              <div className="guide-step">
                <span className="step-num">4</span>
                <p>Come back here, pick the provider and sign in with your new Pod.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="login-section">
          <div className="section-head">
            <span className="section-title">Suggested providers</span>
            <span className="section-hint">Pick a card or use “Custom issuer” below</span>
          </div>
          <div className="provider-grid">
            {providers.map((p) => {
              const isActive = selected === p.url && !useCustom;
              return (
                <button
                  key={p.url}
                  type="button"
                  className={"prov-card" + (isActive ? " active" : "")}
                  onClick={() => {
                    setSelected(p.url);
                    setCustomIssuer("");
                  }}
                  title={p.url}
                >
                  <span className={"radio" + (isActive ? " on" : "")} aria-hidden />
                  <div className="prov-text">
                    <div className="prov-label">{p.label}</div>
                    <div className="prov-url">{p.url}</div>
                    <div className="prov-note">{p.note}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="login-section">
          <div className="section-head">
            <span className="section-title">Custom issuer</span>
            <span className="section-hint">OIDC issuer URL of your Pod provider</span>
          </div>
          <div className="custom-row">
            <input
              className="custom-input"
              placeholder="https://your-pod-provider.example"
              value={customIssuer}
              onChange={(e) => setCustomIssuer(e.target.value)}
            />
            {useCustom && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setCustomIssuer("")}
                title="Back to provider list"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="login-footer">
          <div className="login-meta">
            <span className="dot" /> Solid OIDC Login
          </div>
          <button
            className="login-primary"
            onClick={() => onLogin(issuerToLogin)}
            disabled={!issuerToLogin}
            title="Log in with selected provider"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
            <span>Login</span>
          </button>
        </div>
      </div>
    </div>
  );
}

