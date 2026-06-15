import type { Metadata, Viewport } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

// Brand font — Nunito, a free rounded-geometric sans that matches the
// rentstayable.com brand look (the brand's Adobe "Urbane Rounded" is
// domain-locked and can't load on ops.rentstayable.com). Used for both body
// and headings; weight carries the hierarchy. Geist Mono kept for code.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stayable Operations",
  description: "Property operations platform for RISE8 Companies.",
  manifest: "/app.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stayable Ops",
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
          {children}
          <AppNav />
        </NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
