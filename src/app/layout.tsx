import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Instrument_Serif, JetBrains_Mono, Saira } from "next/font/google";
import AppProvider from "@/components/AppProvider";
import GroupSync from "@/components/GroupSync";
import Header from "@/components/Header";
import MobileNav from "@/components/MobileNav";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const saira = Saira({ variable: "--font-saira", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Alea",
  description: "Bet with your friends on real life. No money: tokens or points, a Bookie who sets the odds, and dares that get done.",
  // Added to the home screen, it opens full screen with its own name.
  appleWebApp: { capable: true, title: "Alea", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#2d2939",
  // Draw under the iPhone home indicator. The bottom bars pad themselves with the safe area.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${instrumentSerif.variable} ${saira.variable} ${jetbrains.variable} antialiased`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" />
      </head>
      <body className="bg-surface font-body-md text-body-md text-on-surface">
        <AppProvider>
          {/* These read the URL, so dynamic routes fill them in at request time. */}
          <Suspense fallback={<aside className="hidden lg:block fixed left-0 top-0 h-full w-[260px] bg-surface-container-low z-50" />}>
            <GroupSync />
            <Sidebar />
            <MobileNav />
          </Suspense>
          <div className="lg:pl-[260px]">
            <Header />
            <main className="pt-20 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-16 px-4 lg:px-gutter-desktop max-w-[1400px]">{children}</main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
