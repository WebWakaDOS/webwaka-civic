/**
 * WebWaka Civic — React Entry Point
 * Blueprint Reference: Part 9.5 (PWA First), Part 9.6 (Offline First)
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
