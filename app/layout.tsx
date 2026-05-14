import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getHubSpotWritebackAutoMode } from "@/services/hubspot-writebacks";

import { AppSidebar } from "./AppSidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PropertyLead Review Desk",
  description: "Review desk for PropertyLead lead triage.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const autoMode = await getHubSpotWritebackAutoMode();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SidebarProvider
          style={{ "--sidebar-width": "15rem" } as React.CSSProperties}
        >
          <AppSidebar autoModeEnabled={autoMode.enabled} />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
