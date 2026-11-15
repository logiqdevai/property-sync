import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Keeps --visual-viewport-height (see index.css) in sync with the real viewport, as in the web app.
function syncVisualViewportHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
}
syncVisualViewportHeight();
window.visualViewport?.addEventListener("resize", syncVisualViewportHeight);
window.addEventListener("resize", syncVisualViewportHeight);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
