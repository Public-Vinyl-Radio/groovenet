import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GrooveNet",
    short_name: "GrooveNet",
    description: "Browse, search, and manage your DJ track collection.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/groovenet-logo.png",
        sizes: "128x128",
        type: "image/png",
      },
    ],
  };
}
