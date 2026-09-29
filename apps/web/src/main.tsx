import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App.tsx";
import { TesterNotice } from "./screens/TesterNotice.tsx";

const path = window.location.pathname.replace(/\/+$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{path === "/tester-notice" ? <TesterNotice /> : <App />}</StrictMode>,
);
