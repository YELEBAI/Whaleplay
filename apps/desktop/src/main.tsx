import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./i18n"; // init i18next before first render
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
