import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VeneMed",
    short_name: "VeneMed",
    description:
      "Listas de insumos médicos de centros de salud en Venezuela. Dona directo a hospitales, clínicas y refugios.",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa", // --background (splash)
    theme_color: "#1f5aa8", // --color-accent
    icons: [
      {
        src: "/manifest-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/manifest-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/manifest-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
