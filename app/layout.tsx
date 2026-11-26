import type { Metadata, Viewport } from "next";
import { Doto, Geist, Geist_Mono } from "next/font/google";
import { themeScript } from "@/components/ui/ThemeToggle";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Dot-matrix display face (SIL OFL). Only for display sizes ≥ 28px.
const dot = Doto({ variable: "--font-doto", subsets: ["latin"], weight: ["400", "700", "900"] });

export const metadata: Metadata = {
  title: { default: "Turnout · Growth Center", template: "%s · Turnout" },
  description: "Attendee growth command center for CampusFest, Bengaluru: measure, diagnose, decide and act.",
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${dot.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
