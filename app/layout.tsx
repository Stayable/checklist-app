import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

// Brand font — POPPINS, adopted 2026-09-11 to match Stayable Elevate, which is
// now the canonical Stayable design system (see docs/design/). It replaced
// Nunito, which was only ever a stand-in: the brand's real face is Adobe
// "Urbane Rounded", domain-locked and unable to load on ops.rentstayable.com.
// Elevate had already solved the same problem with Poppins, so the two products
// now share a typeface instead of each substituting separately.
//
// The CSS variable keeps its old name `--font-nunito`. Renaming it would touch
// globals.css, the @theme font stack and every fallback comment for no visual
// gain, and the fallback chain in globals.css is load-bearing — an unresolved
// font variable makes font-family INVALID and Chrome falls back to Times.
const nunito = Poppins({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StayCheck",
  description: "Property operations platform for RISE8 Companies.",
  manifest: "/app.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StayCheck",
  },
  icons: {
    // Placeholder SVG icons; PNG apple-touch-icons land with the Phase-7
    // Stayable branding kit (TODO.md / open question #7).
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${nunito.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
