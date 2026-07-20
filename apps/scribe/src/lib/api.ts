import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClient,
} from "@trpc/client";
import type { AppRouter } from "@penrunner/api/router";

// L'URL dell'API. In arena l'app funziona offline; queste chiamate avvengono
// solo quando c'è rete (ingresso, download bundle, sync).
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3001";

/** Client tRPC con il token di sessione scoped come Bearer. */
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
