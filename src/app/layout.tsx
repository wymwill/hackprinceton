import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import AppProvider from "@/components/AppProvider";
import GroupSync from "@/components/GroupSync";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Alea",
  description: "Bet with your friends on real life. No money: tokens or points, a Bookie who sets the odds, and dares that get done.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${instrumentSerif.variable} ${inter.variable} ${jetbrains.variable} antialiased`}>
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
          </Suspense>
          <div className="lg:pl-[260px]">
            <Header />
            <main className="pt-20 pb-16 px-4 lg:px-gutter-desktop max-w-[1400px]">{children}</main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
