import type { Metadata } from "next";
import { Suspense } from "react";
import BookieProvider from "@/components/BookieProvider";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import "./globals.css";


export const metadata: Metadata = {
  title: "Bookie — bets with friends, settled by AI",
  description: "No-money bets on real life. Stakes are reputation, titles, and dares.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark antialiased">
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
