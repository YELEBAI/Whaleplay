import React from "react";
import ReactDOM from "react-dom/client";
import { runAllMigrations } from "@/db/migrations";
import "./index.css";

// Storage migrations must complete before any business logic touches
// the KV store, locale, or repositories.
await runAllMigrations();

const [{ App }, { loadPersistedLocale }] = await Promise.all([import("./app/App"), import("./i18n")]);

await loadPersistedLocale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
