import React from "react";
import ReactDOM from "react-dom/client";
import App from "../main.tsx";

// Register the offline/installable service worker only in production builds
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.error("Service worker failed", err));
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
