import type { MetadataRoute } from "next";

/** Web app manifest: installable Turnout (standalone window, dark, dot-matrix icon). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Turnout: attendee growth command centre",
    short_name: "Turnout",
    description: "Measure, diagnose, decide and manage attendee growth, with a grounded AI analyst.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Copilot terminal", url: "/terminal", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Bets", url: "/bets", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
