import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AllotaChatbot } from "@/components/AllotaChatbot";
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
  title: "Allota AI — Telephony Intelligence & PCD Pharma CRM",
  description: "Allota AI Telephony Intelligence & Commercial Operating System at allota.in",
  icons: {
    icon: "/logo-sm.png",
    shortcut: "/logo-sm.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0284c7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative">
        {children}
        <AllotaChatbot />
      </body>
    </html>
  );
}
