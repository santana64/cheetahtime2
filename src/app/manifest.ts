import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cheetah Time — CheetahSoft",
    short_name: "Cheetah Time",
    description: "Planification de projet professionnelle. Gantt, EVM, Monte Carlo, PERT.",
    start_url: "/projects",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0d1f10",
    theme_color: "#1a4a20",
    categories: ["productivity", "business"],
    lang: "fr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [],
    shortcuts: [
      {
        name: "Portefeuille",
        url: "/projects",
        description: "Voir tous les projets",
      },
      {
        name: "Alertes",
        url: "/alerts",
        description: "Alertes intelligentes",
      },
      {
        name: "Portfolio+",
        url: "/portfolio",
        description: "Vue portfolio multi-projets",
      },
    ],
  };
}
