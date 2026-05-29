// PWA service-worker registration helper. Called once, client-side, from the
// root layout via <ServiceWorkerRegister />. Registration is a no-op in dev so
// the SW cache never masks code changes behind the Turbopack dev server.

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Non-fatal: the app works without the SW, just without offline fallback.
      console.error("Service worker registration failed:", err);
    });
  });
}
