import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./i18n";
import { loadPersistedLocale } from "./i18n";
import "./index.css";

// Override the locale from the 3-layer storage before first render.
// The synchronous localStorage default in i18n/index.ts serves as the
// fast path; this call corrects it for Tauri/LAN browser sessions.
await loadPersistedLocale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
