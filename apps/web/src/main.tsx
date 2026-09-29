import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App.tsx";
import { TesterNotice } from "./screens/TesterNotice.tsx";
import { normalizeCode } from "./lib/couples.ts";
import { savePendingInvite } from "./lib/session.ts";

let path = window.location.pathname.replace(/\/+$/, "");

// An invite link: keep the code on the device until sign-in and onboarding are done, and take it out of the
// address bar straight away.
const invite = path.match(/^\/link\/([^/]+)$/);
if (invite) {
  let raw = invite[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // A malformed escape: the code check on the accept screen reports it.
  }
  const code = normalizeCode(raw);
  if (code) savePendingInvite(code);
  window.history.replaceState(null, "", "/");
  path = "";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{path === "/tester-notice" ? <TesterNotice /> : <App />}</StrictMode>,
);
