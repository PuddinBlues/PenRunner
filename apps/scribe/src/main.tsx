import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { requestPersistentStorage } from "./lib/storage.js";
import "./styles.css";

// BR-81: storage durevole richiesto all'avvio (best-effort).
void requestPersistentStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
