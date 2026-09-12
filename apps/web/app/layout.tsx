import type { Metadata, Viewport } from "next";

import "./globals.css";

const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
);

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Good Doomscroller",
    template: "%s · Good Doomscroller",
  },
  description:
    "An endless, quiet feed of remarkable passages from books in the public domain.",
  applicationName: "Good Doomscroller",
  openGraph: {
    title: "Good Doomscroller",
    description:
      "Trade the outrage cycle for an endless feed of remarkable old books.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Good Doomscroller — timeless words, one scroll away",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Good Doomscroller",
    description:
      "Trade the outrage cycle for an endless feed of remarkable old books.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f0e7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
