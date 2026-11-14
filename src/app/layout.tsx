import type { Metadata } from "next";
import { Suspense } from "react";
import { Instrument_Serif, JetBrains_Mono, Saira_Condensed } from "next/font/google";
import BookieProvider from "@/components/BookieProvider";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const saira = Saira_Condensed({ variable: "--font-saira", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Betting with Friends",
  description: "No-money bets on real life. Stakes are reputation, titles, and dares.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${instrumentSerif.variable} ${saira.variable} ${jetbrains.variable} antialiased`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="bg-surface font-body-md text-body-md text-on-surface">
        <BookieProvider>
          {/* Sidebar reads the URL, so dynamic routes like /bets/[id] fill it in at request time. */}
          <Suspense fallback={<aside className="hidden lg:block fixed left-0 top-0 h-full w-[260px] bg-surface-container-low z-50" />}>
            <Sidebar />
          </Suspense>
          <div className="lg:pl-[260px]">
            <Header />
            {children}
          </div>
        </BookieProvider>
      </body>
    </html>
  );
}
