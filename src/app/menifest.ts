import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cusports - Table Tennis Tournament Platform",
    short_name: "Cusports",
    description: "Multi-tenant table tennis tournament and ranking platform",
    start_url: "/",
    display: "standalone",
    background_color: "#fff",
    theme_color: "#fff",
    icons: [
      {
        src: "/favicon.jpeg",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
