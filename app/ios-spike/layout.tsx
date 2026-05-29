import type { Metadata, Viewport } from "next";

// Throwaway Week-1 de-risk spike (TODO.md Phase 1, Fri).
// Scoped manifest + Apple PWA meta tags so this route — and ONLY this route —
// is installable to the iOS home screen in standalone mode. Delete once the
// real PWA shell (Thu) lands and the GO/NO-GO is recorded.
export const metadata: Metadata = {
  title: "iOS PWA Spike — Stayable Ops",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ops Spike",
  },
  icons: { apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function SpikeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
