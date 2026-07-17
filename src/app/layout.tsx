import type { Metadata, Viewport } from "next";
import { DM_Sans, Literata } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";

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
    "A private personal ministry companion for recording conversations, return visits, and ministry time.",
  appleWebApp: {
    capable: true,
    title: "MyWitness",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
