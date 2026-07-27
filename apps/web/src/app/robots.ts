import type { MetadataRoute } from "next";

// NOINDEX finché non dichiariamo il lancio: lo staging vive sui domini reali
// con dati finti — la prima impressione di PenRunner non può essere un sito
// di prova. Al lancio: PUBLIC_INDEXING=true e la SEO parte pulita.
export default function robots(): MetadataRoute.Robots {
  const open = process.env.PUBLIC_INDEXING === "true";
  return {
    rules: open
      ? { userAgent: "*", allow: "/" }
      : { userAgent: "*", disallow: "/" },
  };
}
