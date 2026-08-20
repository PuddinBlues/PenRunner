import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClient,
} from "@trpc/client";
import type { AppRouter } from "@penrunner/api/router";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3001";

/** Portale pubblico (link ai risultati live). */
export const PORTAL_URL =
  (import.meta.env.VITE_PORTAL_URL as string | undefined) ??
  "http://localhost:3000";

/**
 * BR-89: download del conto con il nome file del server (Content-Disposition,
 * esposto in CORS) — i CSV non si "guardano", si salvano.
 */
export async function downloadDoc(path: string, sessionToken: string | null) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: sessionToken ? { authorization: `Bearer ${sessionToken}` } : {},
  });
  if (!res.ok) throw new Error(`Documento non disponibile (${res.status})`);
  const dispo = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(dispo)?.[1] ?? "documento.csv";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Client tRPC con il token di sessione come Bearer. */
export function makeClient(sessionToken: string | null): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers: () =>
          sessionToken ? { authorization: `Bearer ${sessionToken}` } : {},
      }),
    ],
  });
}

export type Client = TRPCClient<AppRouter>;
