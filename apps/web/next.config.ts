import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Il portale è live: le pagine si rendono a richiesta, mai prerender al build
  // (i dati vengono dall'API PenRunner).
  reactStrictMode: true,
  async headers() {
    // NOINDEX a flag (staging sui domini reali con dati finti): al lancio
    // PUBLIC_INDEXING=true e la SEO parte pulita. Vedi anche app/robots.ts.
    if (process.env.PUBLIC_INDEXING === "true") return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
