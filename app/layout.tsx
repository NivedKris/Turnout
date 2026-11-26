import type { Metadata } from "next";
import { Doto, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Dot-matrix display face (SIL OFL). Only for display sizes ≥ 28px.
const dot = Doto({ variable: "--font-doto", subsets: ["latin"], weight: ["400", "700", "900"] });

export const metadata: Metadata = {
  title: "Turnout · Growth Center",
  description: "Attendee growth command center for CampusFest, Bengaluru.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${dot.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
