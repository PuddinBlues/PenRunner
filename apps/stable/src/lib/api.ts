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
