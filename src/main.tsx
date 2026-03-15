/**
 * WebWaka Civic — React Entry Point
 * Blueprint Reference: Part 9.5 (PWA First), Part 9.6 (Offline First)
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { ChurchNGOApp } from "./modules/church-ngo/ui";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ChurchNGOApp />
  </React.StrictMode>
);
