import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Il portale è live: le pagine si rendono a richiesta, mai prerender al build
  // (i dati vengono dall'API PenRunner).
  reactStrictMode: true,
};

export default nextConfig;
