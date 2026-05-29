"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa";

// Mount-once client component that registers the service worker. Rendered in the
// root layout so it covers every route; renders nothing.
export function ServiceWorkerRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
