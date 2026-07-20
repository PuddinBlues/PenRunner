import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "PenRunner",
  description: "Il reining, in diretta — Reining, live",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
