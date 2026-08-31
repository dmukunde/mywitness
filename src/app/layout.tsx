import type { Metadata, Viewport } from "next";
import { DM_Sans, Literata } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyWitness",
  description:
    "Personal Ministry Companion — privately organize ministry notes, conversations, and return visits.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MyWitness",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f7f5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans text-stone-900">
        <ServiceWorkerRegister />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
