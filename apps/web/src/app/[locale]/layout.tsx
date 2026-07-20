import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale, t, type Locale } from "../../lib/i18n";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const tr = t(locale as Locale);
  const other = locale === "it" ? "en" : "it";
  return (
    <div lang={locale}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          background: "var(--ink-900)",
          color: "#fff",
        }}
      >
        <Link
          href={`/${locale}`}
          style={{ fontWeight: 800, fontSize: 18, textDecoration: "none" }}
        >
          🐎 {tr("app.title")}
        </Link>
        <span style={{ color: "var(--slate-400)", fontSize: 13 }}>
          {tr("app.tagline")}
        </span>
        {/* selettore lingua sempre disponibile; la scelta persiste (BR-60) */}
        <a
          href={`/${other}`}
          style={{
            marginLeft: "auto",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            border: "0.5px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            padding: "4px 10px",
          }}
          // eslint-disable-next-line react/no-unknown-property
          data-locale-switch={other}
        >
          {other.toUpperCase()}
        </a>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
        {children}
      </main>
    </div>
  );
}
