import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClient,
} from "@trpc/client";
import type { AppRouter } from "@penrunner/api/router";

export const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** Client tRPC tipizzato end-to-end contro l'API PenRunner. */
export const api: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${API_URL}/trpc` })],
});
