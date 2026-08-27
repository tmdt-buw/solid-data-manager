import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { restoreSession } from "./solidSession";
import { markSafariBrowser } from "./safariDetection";

markSafariBrowser();

const rootElement = document.getElementById("root");

restoreSession().finally(() => {
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
});

reportWebVitals();
