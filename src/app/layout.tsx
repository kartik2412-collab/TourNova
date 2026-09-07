import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "TourNova — Intelligent Tourism & Travel Intelligence",
    template: "%s · TourNova",
  },
  description:
    "TourNova is an intelligent tourism and travel intelligence platform for India. Truthful, sourced destination, price and crowd information.",
  applicationName: "TourNova",
  openGraph: {
    type: "website",
    siteName: "TourNova",
    locale: "en_IN",
    title: "TourNova — Intelligent Tourism & Travel Intelligence",
    description:
      "Intelligent tourism and travel intelligence for India. Truthful, sourced destination, price and crowd information.",
  },
  twitter: {
    card: "summary",
    title: "TourNova — Intelligent Tourism & Travel Intelligence",
    description:
      "Intelligent tourism and travel intelligence for India. Truthful, sourced destination, price and crowd information.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7faf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
