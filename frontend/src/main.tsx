import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { CookieConsent } from "./components/CookieConsent";
import { initServiceWorker } from "./serviceWorker";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <CookieConsent />
  </React.StrictMode>
);

window.addEventListener("load", () => {
  void initServiceWorker();
});
