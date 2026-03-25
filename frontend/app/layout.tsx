import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ensureUploadsStorageReady } from "@/lib/server/attachments";
import { assertRuntimeConfig } from "@/lib/server/env";

import PwaBootstrap from "./pwa-bootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Svarka Weld Messenger",
  description: "Internal corporate messenger for company employees",
  applicationName: "Svarka Weld Messenger",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Messenger",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  assertRuntimeConfig();
  await ensureUploadsStorageReady();

  return (
    <html lang="ru">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
