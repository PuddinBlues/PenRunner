import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClient,
} from "@trpc/client";
import type { AppRouter } from "@penrunner/api/router";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3001";

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

/**
 * Apre un PDF autenticato: fetch con Bearer → blob → nuova scheda. I link
 * diretti non porterebbero il token; i PDF pubblici (start list, classifica)
 * passano comunque da qui per uniformità.
 */
export async function openPdf(path: string, sessionToken: string | null) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: sessionToken ? { authorization: `Bearer ${sessionToken}` } : {},
  });
  if (!res.ok) throw new Error(`PDF non disponibile (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank");
  // Il blob resta valido finché la pagina vive; revoca ritardata prudente.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
