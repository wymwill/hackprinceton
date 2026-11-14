import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import BookieProvider from "@/components/BookieProvider";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const plusJakarta = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bookie — bets with friends, settled by AI",
  description: "No-money bets on real life. Stakes are reputation, titles, and dares.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${plusJakarta.variable} antialiased`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="bg-surface font-body-md text-body-md text-on-surface">
        <BookieProvider>
          <Sidebar />
          <div className="pl-[260px]">
            <Header />
            {children}
          </div>
        </BookieProvider>
      </body>
    </html>
  );
}
