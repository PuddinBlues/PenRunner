import cookie from "@fastify/cookie";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import { createDb } from "@penrunner/db";
import { resolveActor, type AppContext } from "./context.js";
import { appRouter, type AppRouter } from "./routers/index.js";
import { DevMailer } from "./services/mailer.js";

const SESSION_COOKIE = "penrunner_session";

export async function buildServer() {
  const { db } = createDb();
  const mailer = new DevMailer();

  const server = Fastify({ logger: true });
  await server.register(cookie);
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req }): Promise<AppContext> => {
        // Cookie httpOnly in produzione; header Bearer per client di test.
        const bearer = req.headers.authorization?.replace(/^Bearer /, "");
        const sessionToken = req.cookies[SESSION_COOKIE] ?? bearer;
        const { actor, sessionId } = await resolveActor(db, sessionToken);
        return sessionId
          ? { db, mailer, actor, sessionId }
          : { db, mailer, actor };
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  server.get("/health", async () => ({ ok: true }));
  return server;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  const port = Number(process.env.PORT ?? 3001);
  buildServer()
    .then((server) => server.listen({ port, host: "0.0.0.0" }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
